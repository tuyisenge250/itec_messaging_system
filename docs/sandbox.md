# Sandbox

This document explains the sandbox environment: what gets provisioned automatically, how the deterministic test numbers work, and how to exercise the full send/deliver/webhook/retry/idempotency pipeline locally without any real telecom or payment credentials. It assumes you've read `docs/architecture.md` and `docs/message-flow.md` first.

## What sandbox is — and isn't

Sandbox is a fully simulated SMS and payment environment. No real SMS is ever sent, no real money is ever charged, and no telecom or payment provider is ever contacted — every send is handled by `SimulatorSmsProvider` (`modules/simulator/simulator-sms-provider.ts`), which plays both roles a real provider would: an immediate accept/reject response, and — since there's no real telecom infrastructure to call us back — its own later delivery callback, routed through the exact same idempotent pipeline (`modules/webhooks/inbound-processor.ts`) a real provider's webhook would hit.

`Environment` (`SANDBOX` / `PRODUCTION`) is a real column on every tenant-owned table that needs it (`Wallet`, `ApiKey`, `SenderId`, `Message`, `Campaign`, `PaymentIntent`, `ProviderConfig`, `SimulatorScenario`, `Webhook`, `IdempotencyRecord`) — sandbox and production never share a wallet, sender ID, API key, or message. An API key is permanently pinned to one environment (`modules/api-keys/service.ts::verifyApiKeyToken`); the provider factory (`modules/providers/factory.ts::resolveSmsProvider`) resolves a `simulator` or real adapter purely from the environment-scoped `ProviderConfig` row, never from an `if (environment === "sandbox")` scattered through business logic.

Every security control still applies in sandbox exactly as in production: authentication, RBAC, organization isolation, rate limiting, fraud rules, idempotency, wallet checks, sender ID validation, and audit logging. **Sandbox only replaces the external provider — never the platform's own rules.**

## Automatic onboarding

Every new organization gets a frictionless sandbox setup with no approval workflow, driven by `modules/organizations/onboarding-service.ts::provisionSandboxOnboarding`, called from `createOrganization` (`modules/organizations/service.ts`) inside the same transaction that creates the organization and its sandbox wallet:

```
Organization created
        |
SANDBOX wallet created (ensureWallet)
        |
Sandbox Sender ID created — ACTIVE immediately, no SenderIdRequest/RURA workflow
        |
Initial sandbox credit granted — a BONUS/SYSTEM WalletLedgerEntry, never a fake payment
        |
Sandbox API key created — plaintext secret returned once, in the create-organization response
        |
Sandbox is ready to send
```

The `POST /api/organizations` response includes a one-time `sandboxOnboarding` object (`{ senderId, initialCreditMinorUnits, apiKey: { plaintextToken } }`) — the dashboard shows this exactly once (`app/dashboard/page.tsx`'s `SandboxReadyCard`) right after creating an organization; it is never returned again (the API key secret is only ever stored hashed, same as any other key — see `modules/api-keys/service.ts`).

Each step is individually idempotent (`ensureSandboxSenderId` finds-before-creates against the `(organizationId, value, environment)` unique constraint; `grantInitialSandboxCredit` checks for an existing `WalletLedgerEntry` with `referenceType: "SYSTEM", referenceId: "sandbox-onboarding"` before crediting), so re-running onboarding for the same organization never double-grants credit or creates a duplicate sender ID.

The auto-generated sender ID value is `{SANDBOX_DEFAULT_SENDER_PREFIX}_{shortcode}`, truncated to fit the real GSM alphanumeric sender ID cap (11 characters — the same constraint `modules/sender-ids/validation.ts` enforces for production requests), e.g. `TEST_ACME` or `TEST_UMUHAN`. See `shared/utils/sandbox.ts::generateSandboxSenderIdValue`.

## Test numbers

Sandbox test numbers are virtual — they are never real recipients, and a message sent to one never leaves the sandbox. They live in the national `SANDBOX_TEST_NUMBER_PREFIX` block (default `700000`, i.e. `+250700000XXX`), which is deliberately **not** a real Rwandan mobile prefix (`72`/`73`/`75`/`78`/`79`), so these numbers can never collide with, or accidentally reach, a real subscriber. `shared/utils/phone.ts::normalizeRwandaPhoneNumber` only accepts this block when `environment === "SANDBOX"` — the same call in production only accepts real prefixes.

Each number maps to a `SimulatorScenario` row (seeded by `prisma/seed.ts::seedSandboxTestNumberScenarios`, also visible/editable under Admin → Simulator → Scenarios) with `triggerType: PHONE_NUMBER`, matched before any random/catch-all scenario (see `modules/simulator/scenario-matcher.ts`):

| Number | Behaviour | Provider response | Final status |
|---|---|---|---|
| `+250700000001` | Delivered | ACCEPTED | DELIVERED |
| `+250700000002` | Failed after acceptance | ACCEPTED | FAILED |
| `+250700000003` | Expires before confirmation | ACCEPTED | EXPIRED |
| `+250700000004` | Rejected immediately | REJECTED | UNDELIVERED |
| `+250700000005` | Delivered, but slowly (15s) — useful for testing loading/polling UI | ACCEPTED | DELIVERED |
| `+250700000006` | Simulated provider timeout | TIMEOUT | UNDELIVERED |
| `+250700000007` | Simulated provider unavailable | UNAVAILABLE | UNDELIVERED |
| `+250700000008` | Times out twice, then delivered on the 3rd attempt | TIMEOUT → TIMEOUT → ACCEPTED | DELIVERED |

This table is also available live at `GET /api/sandbox/test-numbers` (backed by `modules/sandbox/service.ts`, generated from the actual `SimulatorScenario` rows rather than hardcoded) and rendered at **Dashboard → Developers → Sandbox Guide** (`app/dashboard/sandbox/page.tsx`), with a quick-picker on the Send SMS page.

Any other number with a real Rwandan mobile prefix is accepted too and, unless it matches an admin-configured scenario, is delivered successfully after `SANDBOX_DEFAULT_DELIVERY_DELAY_MS` (the seeded catch-all scenario).

### Why #008 is a special case

A `SimulatorScenario` row's outcome doesn't vary by attempt count — there's no schema field for "fail N times, then succeed," and adding one for a single documented test number wasn't judged worth a migration. `+250700000008`'s behaviour is implemented directly in `modules/simulator/simulator-sms-provider.ts`: for the first two attempts it returns `TIMEOUT` before scenario matching even runs; from the third attempt onward it falls through to a normal `PHONE_NUMBER` scenario row (so it still gets its own `SimulatorExecution` history like every other number). The retry loop it exercises — `TIMEOUT` → `handleTransientFailure` persists `attempts` and re-throws → BullMQ retries with backoff (`infrastructure/queues/queues.ts`, `attempts: 5`, exponential backoff) — is the same, real, production-shaped retry mechanism `modules/messaging/send-processor.ts` uses for any transient provider failure, not a special code path of its own.

## Idempotency

`POST /api/messages` accepts an optional `Idempotency-Key` header (`modules/idempotency/service.ts::withIdempotency`, backed by the `IdempotencyRecord` table's `(organizationId, environment, scope, key)` unique constraint):

- Same key + same request body → replays the original response; `sendMessage` never runs twice.
- Same key + a different request body → `409 IDEMPOTENCY_KEY_REUSED`.
- Same key, first request still in flight → `409` (a concurrent replay is rejected, not queued).
- The handler throwing → the pending record is deleted, so the same key can be retried.

Payment intents have their own purpose-built idempotency mechanism (a unique constraint directly on `PaymentIntent`) — see `modules/billing/payment-service.ts`; the generic `IdempotencyRecord` module exists so other endpoints (like messages) can opt in without re-deriving this.

## Sandbox payments

Buying an SMS package in sandbox (`POST /api/payment-intents`) goes through `SimulatedPaymentProvider` (`modules/billing/providers/simulated-payment-provider.ts`), which lets a sandbox-only request pass `simulateOutcome: "SUCCEEDED" | "FAILED" | "TIMEOUT" | "PROVIDER_UNAVAILABLE"` to force a specific result for testing your own error handling — see `modules/billing/payment-service.ts`, `input.environment === "SANDBOX" ? input.simulateOutcome : undefined`. A successful charge credits the wallet inside the same transaction that marks the `PaymentIntent` `SUCCEEDED`, so a retried request (same `Idempotency-Key`) can never credit twice.

## Configuration

```env
SANDBOX_ENABLED=true                        # set false to skip automatic onboarding entirely
SANDBOX_INITIAL_CREDIT_MINOR_UNITS=10000    # 1 minor unit = 1 RWF in this project's money model
SANDBOX_DEFAULT_DELIVERY_DELAY_MS=3000
SANDBOX_TEST_NUMBER_PREFIX=700000           # national-format (no country code) prefix
SANDBOX_DEFAULT_SENDER_PREFIX=TEST
```

See `infrastructure/config/env.ts` for validation and defaults.

## Trying it yourself

```bash
# 1. Migrate + seed (adds the sandbox test-number scenarios if missing — safe to re-run)
npm run db:migrate
npm run db:seed

# 2. Run the app and the worker (the worker processes queued sends/deliveries — nothing
#    sends without it)
npm run dev
npm run worker   # separate terminal

# 3. Register, create an organization, and note the one-time API key from the dashboard's
#    "Sandbox ready" card (or POST /api/organizations directly, see below)

# 4. Send to a deterministic test number
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer sk_test.<publicId>.<secret>" \
  -H "Idempotency-Key: test-123" \
  -H "Content-Type: application/json" \
  -d '{"senderIdId": "<your sandbox sender ID id>", "recipients": ["+250700000001"], "content": "Hello from sandbox"}'

# 5. Poll it
curl http://localhost:3000/api/messages/<id> -H "Authorization: Bearer sk_test...."
```

- **Test DELIVERED**: send to `+250700000001`, poll until `status: "DELIVERED"`.
- **Test FAILED**: send to `+250700000002`.
- **Test TIMEOUT**: send to `+250700000006` — the recipient reaches `FAILED` after `ProviderConfig.retryCount` attempts (default 3), each logged as its own `ProviderTransaction`.
- **Test RETRY**: send to `+250700000008` and inspect `GET /api/recipients/:id/provider-transactions` — you should see 3 attempts, the first two `TIMEOUT`, the last `ACCEPTED`.
- **Test webhooks**: configure a webhook endpoint (Dashboard → Developers → Webhooks) for `message.delivered`/`message.failed`, send to any test number, and check its delivery history.
- **Verify wallet accounting**: `GET /api/wallet/transactions?environment=SANDBOX` — a send reserves credit (`RESERVATION`), then either consumes it at acceptance (`SMS_USAGE`) or releases it if rejected before submission (`RESERVATION_RELEASE`); final delivery outcome never touches the wallet again.
- **Verify sandbox can't reach production**: a `sk_test.*` key against a request that resolves to `PRODUCTION` fails with `API_KEY_ENVIRONMENT_MISMATCH` before any provider is ever considered — see `modules/api-keys/service.ts::verifyApiKeyToken` and `tests/sandbox.test.ts`'s "environment isolation" suite.

`tests/sandbox.test.ts` covers this whole lifecycle end to end (onboarding, deliver, fail, duplicate provider webhook, retry-then-delivered, insufficient balance, message-send idempotency, API key environment isolation) against a real local Postgres/Redis — run it with `npx vitest run tests/sandbox.test.ts`.

## Known limitations

- No real SMS or payment provider is implemented — see `docs/provider-integration.md`.
- Fraud rate limits are seeded generously (`SMS_PER_MINUTE`/`HOUR`/`DAY`, `GLOBAL` scope) for normal testing; to exercise `BLOCK`/`THROTTLE`/`FLAG_FOR_REVIEW` behaviour deliberately, temporarily lower a rule's `thresholdValue` under Admin → Fraud → Rules rather than relying on a dedicated always-on low-threshold rule (a global low threshold would also throttle legitimate testing traffic for every organization).
- `Contact`/`ContactGroup`/`Template` have no `environment` column by design (a phone number isn't sandbox-or-production) — they're excluded from the sandbox/production split described above.
