# Message flow

End-to-end trace of a single SMS send, from API call to final delivery status, with the exact files involved at each step. See `docs/architecture.md` for the reasoning behind each piece; this document is the "what happens, in order" reference.

## 1. Request in

`POST /api/messages` (`app/api/messages/route.ts`) or a campaign batch via `modules/campaigns/service.ts::sendCampaign`, which calls the same entry point.

```
Client
  │  POST /api/messages { senderIdId, recipients: [...], content, clientReference? }
  ▼
app/api/messages/route.ts        — withRoute() wrapper: request ID, error → standard JSON shape
  │  getActorContext(request)     — session cookie OR API key → ActorContext { organizationId, ... }
  │  resolveEnvironment(actor, request)
  ▼
modules/messaging/service.ts :: sendMessage(actor, organizationId, environment, input)
```

## 2. Validation and authorization

- `assertPermission(actor, PermissionCode.SMS_SEND)` — DB role check (session) or `ApiKey.scopes` check (API key).
- `assertOrganizationAccess(actor, organizationId)` — the org came from the actor, never from the request body.
- Organization must be `ACTIVE` if `environment === PRODUCTION` (sandbox sends are allowed regardless of verification status, so integrators can build against the API before going live) → `ErrorCode.ORGANIZATION_NOT_VERIFIED` otherwise.
- `SenderId` must belong to this org, match the requested environment, and be `ACTIVE` → `ErrorCode.SENDER_ID_NOT_ACTIVE` otherwise.
- Wallet for `(organizationId, environment)` must exist (created at org creation for `SANDBOX`, at org activation for `PRODUCTION`).

## 3. Fraud / rate limiting

`modules/fraud/service.ts::checkSmsSendLimits({ organizationId, apiKeyId, ipAddress, recipientCount })` — checks enabled `SMS_PER_MINUTE`/`SMS_PER_HOUR`/`SMS_PER_DAY`/`ORGANIZATION_QUOTA` rules against Redis counters. A `BLOCK` or `FLAG_FOR_REVIEW` rule throws here, before anything is written to Postgres.

## 4. Pricing and segmentation

`shared/utils/sms-segmentation.ts::segmentMessage(content)` — GSM-7 vs UCS-2, single vs multipart segment count. `modules/billing/pricing-service.ts::calculateMessageCost(organizationId, segmentCount)` — the org's assigned `PricingPlan` if active, else the global default plan.

## 5. One atomic transaction — the transactional outbox write

```
prisma.$transaction:
  ├─ create Message (status = QUEUED, or SCHEDULED if scheduledAt is in the future)
  ├─ for each recipient phone number:
  │     normalize (shared/utils/phone.ts — Rwanda-specific E.164)
  │     invalid?  → create MessageRecipient(status=REJECTED), no wallet reservation
  │     valid?    → create MessageRecipient(status=QUEUED)
  │                 reserveForRecipient(tx, ...) — atomic conditional wallet UPDATE;
  │                 insufficient balance → ENTIRE transaction rolls back (all-or-nothing
  │                 for the batch: either every valid recipient gets reserved credit or none do)
  ├─ update Message aggregate counts (queuedCount, totalCostMinorUnits)
  └─ create OutboxEvent(eventType = SMS_SEND_REQUESTED, aggregateId = message.id, status = PENDING)
COMMIT
```

If `scheduledAt` is in the future, the `OutboxEvent` is **not** created yet — recipients and reservations exist, but the send doesn't become live until the scheduled-messages poller creates the outbox event when it's due (§9 below). This means credit is locked in from the moment a send is scheduled, not from when it actually fires.

## 6. Publish to Redis (best effort, then guaranteed)

```
tryPublishImmediately(outboxEvent)
  │  for SMS_SEND_REQUESTED: find all QUEUED MessageRecipient rows for this message,
  │  enqueue one sms-send job per recipient (jobId = recipientId)
  ├─ success → mark OutboxEvent PUBLISHED
  └─ failure (Redis down, etc.) → leave PENDING; the outbox-publish repeatable worker
                                    (workers/outbox-poller-worker.ts, every 5s) retries
                                    with exponential backoff (OutboxEvent.nextAttemptAt)
```

The API response returns here — `sendMessage` returns the `Message` (with `acceptedRecipients`/`rejectedRecipients` counts) synchronously; nothing about the actual provider call has happened yet.

## 7. sms-send worker: talk to the provider

`workers/sms-send-worker.ts` → `modules/messaging/send-processor.ts::processSmsSendJob(recipientId)`:

```
load MessageRecipient (+ its Message) from Postgres — job payload was only an id
recipient.status !== QUEUED?  → no-op (idempotency: duplicate/racing job for an
                                  already-progressed recipient)
status → PROCESSING
resolveSmsProvider(environment)          — modules/providers/factory.ts, reads active
                                             ProviderConfig, returns the adapter (only
                                             "simulator" implemented today)
canAttempt(circuitKey)?  false → treat as PROVIDER_UNAVAILABLE, transient-failure path
provider.sendSms({ senderId, recipient, message, simulatorContext: {...} })
  │
  ├─ ACCEPTED   → recordSuccess(circuit); recipient → SENT, providerMessageId set;
  │               resolveReservationForRecipient(recipientId, "CONSUMED")
  │               — this is the billing point: submission accepted, not final delivery
  │
  ├─ REJECTED   → recordFailure(circuit); recipient → FAILED (terminal, no retry);
  │               resolveReservationForRecipient(recipientId, "RELEASED")
  │
  └─ TIMEOUT/ERROR → recordFailure(circuit); attempts < ProviderConfig.retryCount?
                       yes → recipient → QUEUED, throw (BullMQ retries the job with backoff)
                       no  → recipient → FAILED (terminal), reservation RELEASED
```

Every attempt (including circuit-open synthetic failures) is logged as a `ProviderTransaction` row — request/response payload, status, attempt number.

## 8. Simulated async delivery

Only reached when step 7 returned `ACCEPTED`. Before returning, `SimulatorSmsProvider.sendSms()` (`modules/simulator/simulator-sms-provider.ts`) already:

- matched the request against `SimulatorScenario` rows (`modules/simulator/scenario-matcher.ts`) to decide the *final* outcome and delay
- scheduled a delayed `sms-delivery` job (`delay = scenario.delayMs`, `jobId = "delivery-" + recipientId`)

```
[ after scenario.delayMs ]
workers/sms-delivery-worker.ts
  │  calls modules/webhooks/inbound-processor.ts :: processProviderDeliveryEvent(...)
  │  DIRECTLY — not via HTTP to POST /api/webhooks/simulator (see docs/architecture.md
  │  "Simulator architecture" for why) — but it is the exact same function that route
  │  handler calls after signature verification, so the two paths are identical from here
  ▼
processProviderDeliveryEvent({ recipientId, providerMessageId, finalStatus, errorCode?, errorMessage? })
  │  recipient already terminal (DELIVERED/FAILED/EXPIRED/REJECTED/CANCELLED)?
  │    → no-op (idempotent: duplicate delivery events never double-apply)
  ├─ update MessageRecipient.status → DELIVERED or FAILED (UNDELIVERED also maps to FAILED
  │  — RecipientStatus has no separate "undelivered" bucket)
  ├─ recomputeAggregateStatus(tx, messageId) — recounts every recipient's status and
  │  flips Message.status once every recipient has reached a terminal state:
  │  all DELIVERED → DELIVERED; mix of delivered+failed → PARTIALLY_DELIVERED;
  │  all failed → FAILED; still some QUEUED/PROCESSING → PROCESSING
  └─ dispatchWebhookEvent(organizationId, "message.delivered" | "message.failed", {...})
       — fire-and-forget; failure here is logged, never rethrown into the delivery path
```

Wallet is **not** touched again here — the reservation was already resolved at step 7 (submission time).

## 9. A real provider's webhook (for contrast)

If a real provider were plugged in instead of the simulator, step 8 above wouldn't exist — `provider.sendSms()` would return `ACCEPTED` and that's it. Sometime later, the real provider calls:

```
POST /api/webhooks/:provider
  │  app/api/webhooks/[provider]/route.ts
  │  1. identify provider from the URL segment
  │  2. verify signature (HMAC — each provider's own scheme; "simulator" uses
  │     SIMULATOR_WEBHOOK_SECRET, a real adapter would use that provider's own scheme)
  │  3. normalize the provider's payload into { recipientId, providerMessageId,
  │     finalStatus, errorCode?, errorMessage? }
  ▼
processProviderDeliveryEvent(...)   — same function, same idempotency guarantee
```

This is why the simulator calling the function directly (step 8) is a safe shortcut rather than a divergent code path: whichever way a delivery event arrives, it goes through the same status-update/aggregate-recompute/outbound-dispatch logic.

## 10. Outbound webhook delivery to the customer

```
dispatchWebhookEvent → for each active Webhook on this org whose `events` array
                        includes the event type:
                          create WebhookDelivery(status=PENDING)
                          enqueue webhook-processing job { webhookDeliveryId }
                                                              │
workers/webhook-dispatch-worker.ts                            ▼
  modules/webhooks/delivery-sender.ts :: processWebhookDispatchJob
    │  HMAC-sign the payload with this Webhook's own (decrypted) secret
    │  POST to Webhook.url, 10s timeout
    ├─ 2xx  → WebhookDelivery → DELIVERED
    └─ else/error → is this BullMQ's final configured attempt?
                       no  → leave PENDING, throw (BullMQ retries with backoff)
                       yes → WebhookDelivery → EXHAUSTED
```

## Scheduled sends (the one piece not covered above)

```
workers/scheduled-messages-worker.ts (repeatable, every 15s)
  → modules/messaging/service.ts :: processDueScheduledMessages()
      find Message rows: status = SCHEDULED, scheduledAt <= now()
      for each: flip status → QUEUED, create the OutboxEvent (step 5's last line,
                deferred until now), tryPublishImmediately — from here it's identical
                to step 6 onward
```

## Reading this against the customer/admin API surface

- Customer-visible progress: `GET /api/messages/:id` (aggregate counts + status), `GET /api/messages/:id/recipients` (per-recipient detail), `GET /api/recipients/:id`.
- Admin-visible: `GET /api/admin/messages` (cross-org), `GET /api/admin/simulator/executions` (what the simulator actually decided for each recipient and why), `GET /api/admin/fraud-events` (anything a `FraudRule` flagged along the way).
