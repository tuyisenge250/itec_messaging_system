# Architecture

This document explains how the SMS Gateway backend is put together and, more importantly, *why* — the tradeoffs that shaped each decision. It assumes the reader is a developer joining the project, not a user of it.

## Overall shape: modular monolith

Everything runs as one Next.js application plus one standalone worker process, not microservices. Route handlers under `app/api/**` are thin — they parse input, resolve who's calling (`ActorContext`), call exactly one function in `modules/<domain>/service.ts`, and shape the response. All business logic, authorization, and Prisma access live in `modules/`:

```
app/api/**/route.ts      thin: parse → resolve actor → call one service fn → respond
modules/<domain>/
  repository.ts           the ONLY file that calls prisma.* for that domain
  service.ts               business logic: permission checks, orchestration, transactions
  validation.ts             Zod schemas
infrastructure/            Prisma client, Redis client, BullMQ queues, logger, storage, env
shared/                    errors, http helpers, constants (permissions/roles), utils
workers/                   standalone BullMQ worker process (separate from the Next.js server)
```

This is deliberately boring: a route handler that talks to Prisma directly, or a service that skips the permission check because "it's just an admin page," is the kind of shortcut that turns into a tenant-isolation bug six months later. Keeping the layering strict is cheaper than debugging a leak.

## Module boundaries

Each business domain (`auth`, `organizations`, `documents`, `sender-ids`, `wallets`, `billing`, `messaging`, `campaigns`, `contacts`, `templates`, `providers`, `simulator`, `webhooks`, `fraud`, `api-keys`, `audit`) owns its own repository/service/validation files and does not reach into another domain's repository — it calls the other domain's *service* functions instead (e.g. `modules/campaigns/service.ts` calls `modules/messaging/service.ts::sendMessage` per batch rather than duplicating message-creation logic, and `modules/billing/payment-service.ts` calls `modules/wallets/service.ts::creditWalletTx` rather than writing wallet rows itself). This keeps each domain's invariants (permission checks, state machines, transactional boundaries) enforced in exactly one place.

## Multi-tenancy and the authorization model

`Organization` is the tenant boundary. Every tenant-owned table has an `organizationId` column. The rule that matters more than the column, though: **`organizationId` is never trusted from a client-supplied value.** A route handler never does `where: { id: body.organizationId }`. Instead:

1. Every authenticated request builds an `ActorContext` (`shared/types/actor-context.ts`) — from a session cookie (`getSessionActorContext`) or an API key (`getApiKeyActorContext`), both in `modules/auth/services/request-context-service.ts`. This resolves `organizationId` from real `OrganizationMembership` or `ApiKey` rows, never from anything the client sent in the body.
2. Every service function calls `assertOrganizationAccess(actor, organizationId)` before doing anything scoped to an org, and — once it has loaded a specific row — `assertResourceBelongsToOrganization(row.organizationId, organizationId)`. Both live in `modules/auth/services/authorization-service.ts`. A mismatch on the resource check returns 404, not 403 — the existence of another tenant's resource is not revealed.
3. Permissions are checked via `assertPermission(actor, PermissionCode.X)`, never via a role-name string comparison.

### RBAC is data, not code

`Role`, `Permission`, and `RolePermission` are Prisma models (seeded in `prisma/seed.ts`), not a TypeScript enum-to-permissions map. `assertPermission` joins `OrganizationMembership → Role → RolePermission → Permission` for a session user, or checks `ApiKey.scopes` for an API-key actor, and short-circuits to `true` unconditionally for `User.isPlatformAdmin`. Platform staff (internal support/ops) are not modeled as members of any organization — they carry a boolean flag and bypass org-role permission checks entirely, which is also why "platform admin only" endpoints under `/api/admin/**` call `requirePlatformAdmin(actor)` rather than relying on any org role.

A handful of permissions (`documents.review`, `sender_id.approve`, `fraud.review`, `audit.read`, `simulator.manage`, `provider.manage`, `pricing.manage`, `admin.*`, `wallet.adjust`, `sender_id.manage_lifecycle`) are seeded into the `Permission` table but never granted to any `Role` — they only exist for platform admins via the bypass. This is intentional: there is currently no finer-grained platform-role split (e.g. read-only support vs full ops) — see "Known limitations" below.

## Database design

PostgreSQL is the single source of truth for all business state. Redis holds only ephemeral/operational data: BullMQ queue state, rate-limit counters, and circuit-breaker state — never the permanent record of anything. If Redis is flushed, no business fact is lost; in-flight sends stall until a worker restarts and the outbox poller catches up.

Money is stored as `Int` "minor units" throughout (`Wallet.availableBalanceMinorUnits`, `PricingPlan.pricePerSegmentMinorUnits`, etc.), never floating point. Rwandan Francs have no real-world subunit, so for `RWF`, 1 minor unit = 1 RWF (`shared/utils/money.ts` keeps a multiplier table so a currency with real cents wouldn't require touching every call site). `Int` (Postgres `int4`, ~2.1B max) is sufficient for this platform's expected scale — a single organization's lifetime spend or an individual transaction amount is nowhere near that ceiling. If it ever needed to change, `BigInt` is the documented upgrade path, at the cost of `bigint`-typed values throughout the JS layer (JSON serialization needs care).

IDs are `cuid()` throughout. Timestamps are `@db.Timestamptz(3)` (timezone-aware) except where a field is genuinely a cache-key-style value. Audit/financial history (`AuditEvent`, `WalletLedgerEntry`, `ProviderTransaction`, `PaymentTransaction`) is append-only — nothing in the codebase updates or deletes these rows; they are the record of what happened, not current-state tables.

### Sender ID workflow is two models, not one

`SenderIdRequest` is the workflow object (`DRAFT → SUBMITTED → ... → APPROVED/REJECTED/CANCELLED`, state machine in `modules/sender-ids/state-machine.ts`). `SenderId` is the live, operational resource that `Message`/`Campaign` actually reference (`ACTIVE/SUSPENDED/EXPIRED/CANCELLED`). Approval (`approveSenderIdRequest`) atomically creates the `SenderId` row and links back via `SenderIdRequest.approvedSenderIdId` in one transaction. Keeping these separate means the workflow history (RURA reference numbers, internal reviewer notes, rejection reasons) never has to be reconstructed from a single mutable status field, and a `SenderId` can be suspended/reactivated without touching the (by then irrelevant) request record. A `RURA_APPROVED` status in this system is **only** this platform's record that its own internal review process reached that step — it is never real regulatory approval, and nothing in the UI/API should imply otherwise.

## Provider architecture

`modules/providers/sms-provider.ts` defines the `SmsProvider` interface (`sendSms`, `getDeliveryStatus`) that all business logic depends on. `modules/providers/factory.ts::resolveSmsProvider(environment)` is the **only** place in the codebase that maps a provider identifier to a concrete class — it reads the active `ProviderConfig` row for the given kind+environment and switches on `providerCode`. This is what "no `if (provider === "mtn")` scattered through the codebase" means in practice: adding a real provider later is one new adapter class plus one new `case` in the factory, not a search-and-replace through the messaging domain.

`ProviderConfig` rows also carry operational tuning (rate limit, max concurrency, timeout, retry count, backoff base, circuit-breaker threshold/cooldown) so none of that is hardcoded per-provider in application code either.

### Circuit breaker

`modules/providers/circuit-breaker.ts` implements CLOSED → OPEN → HALF_OPEN entirely in Redis, keyed per `providerCode:environment` so it's shared across every worker process (not per-instance state, which would be useless — one worker seeing failures needs to stop every worker from hammering a dead provider). `canAttempt()` is checked before every provider call in `modules/messaging/send-processor.ts`; when it returns false the recipient is failed/retried through the same transient-failure path as a real timeout, without ever calling the provider.

## Simulator architecture

The simulator (`modules/simulator/`) exists to let the entire send → accept → async-deliver → webhook pipeline be exercised without a real telecom integration, and it must **not** shortcut that pipeline — it plays the role of a real provider honestly:

1. `SimulatorSmsProvider.sendSms()` matches the request against enabled `SimulatorScenario` rows (admin-managed via `/api/admin/simulator/scenarios`, matched by `modules/simulator/scenario-matcher.ts` — highest `priority` first, first match wins, trigger types are `PHONE_NUMBER`/`SENDER_ID`/`ORGANIZATION`/`MESSAGE_ID`/`API_KEY`/`MESSAGE_CONTENT`/`RANDOM_PERCENTAGE`). It returns an **immediate** accept/reject — exactly what calling a real provider's synchronous API would give you.
2. If accepted, it does **not** return `DELIVERED`. It schedules a delayed `sms-delivery` BullMQ job (delay = `scenario.delayMs`) carrying the scenario's configured final outcome. This is the one place the simulator has to do something a real provider wouldn't: because there's no real telecom infrastructure to call our webhook back later, the simulator arranges its own future "callback."
3. When that delayed job fires (`workers/sms-delivery-worker.ts`), it calls `modules/webhooks/inbound-processor.ts::processProviderDeliveryEvent` **directly** — the exact same function `POST /api/webhooks/:provider` calls after verifying a real provider's webhook signature. This is a deliberate, documented deviation from doing a literal HTTP round-trip to our own webhook endpoint: it keeps the delivery pipeline deterministic and easy to test, while still guaranteeing the simulator and a real provider's webhook produce identical state transitions, because they run through identical code.

Configuration is structured data only (trigger type/value, initial status, final status, delay, error code/message, probability, priority) — there is no way to inject arbitrary code as simulator configuration.

## Redis / BullMQ

Queues (`infrastructure/queues/queue-names.ts`):

| Queue | Purpose |
|---|---|
| `sms-send` | One job per `MessageRecipient`. `jobId = recipientId`, so re-adding a job for a recipient that's already queued/active/delayed is a BullMQ-level no-op — free idempotency against duplicate outbox publishes. |
| `sms-delivery` | Delayed job simulating a provider's async delivery callback (see Simulator, above). |
| `outbox-publish` | Repeatable job (every 5s) that sweeps `OutboxEvent` rows still `PENDING` after the immediate-publish attempt failed. |
| `scheduled-messages` | Repeatable job (every 15s) that finds `Message` rows with `status = SCHEDULED` and `scheduledAt <= now()` and hands them to the outbox. |
| `webhook-processing` | Outbound dispatch of customer-configured webhooks, with retry/backoff. |

Job payloads are identifiers only (`{ recipientId }`, `{ webhookDeliveryId }`) — every worker reloads the authoritative record from Postgres before acting. This means a stale or duplicated job can never carry stale business data; at worst it re-reads state that's already been resolved and no-ops (see idempotency checks in `send-processor.ts` and `inbound-processor.ts`).

Redis connection failure does not corrupt business state: message/recipient/wallet rows are already committed in Postgres by the time anything touches Redis (see Transactional Outbox below), so a Redis outage just delays processing until the outbox poller (which only needs Postgres + Redis-when-available) catches up.

## Transactional outbox

A naive implementation would create a BullMQ job and then write to Postgres, or vice versa — either order has a window where one succeeds and the other doesn't, silently losing or duplicating a send. Instead, `modules/messaging/service.ts::sendMessage` does this in **one** Prisma transaction:

```
BEGIN
  create Message
  create MessageRecipient rows (segmentation, cost)
  reserve wallet credit per recipient (atomic conditional UPDATE, see below)
  create OutboxEvent (status = PENDING)
COMMIT
```

After commit, `tryPublishImmediately()` makes a best-effort attempt to enqueue the BullMQ jobs and mark the event `PUBLISHED`. If that fails (Redis down, process crash), the event stays `PENDING`, and the `outbox-publish` repeatable worker picks it up later — with exponential backoff via `OutboxEvent.nextAttemptAt`, capped at 5 minutes, up to 10 attempts before the event is marked `FAILED` (which pages nobody automatically today; see Known limitations).

`OutboxEvent.aggregateId` is deliberately **not** a foreign key — it's a loose reference (e.g. a `Message.id`) resolved by the publisher at publish time. This keeps the outbox table generic across aggregate types without needing a nullable FK to every possible aggregate model.

## Wallet / ledger

The wallet is an SMS-credit wallet, not a general payment wallet. `Wallet.availableBalanceMinorUnits` and `reservedBalanceMinorUnits` are never updated with a naive `balance += amount` — every change goes through `modules/wallets/repository.ts`, which uses **atomic conditional `updateMany` calls**, e.g.:

```ts
tx.wallet.updateMany({
  where: { id: walletId, availableBalanceMinorUnits: { gte: amount } },
  data: { availableBalanceMinorUnits: { decrement: amount }, reservedBalanceMinorUnits: { increment: amount } },
})
```

This is the concurrency-safety mechanism, and it works without any explicit application-level locking: Postgres serializes concurrent `UPDATE`s against the same row, and the `WHERE` clause's balance check is re-evaluated against the (now-updated) row for the second of two concurrent transactions — so two simultaneous sends against a wallet that can only afford one of them can never both succeed. If the condition doesn't hold, `updateMany` affects zero rows, which the repository turns into `InsufficientBalance`.

Every balance change writes an immutable `WalletLedgerEntry` in the same transaction, snapshotting both `balanceAfterMinorUnits` and `reservedAfterMinorUnits` — the ledger is the audit trail; a reader reconstructing history should trust those snapshots, not re-sum `amountMinorUnits` (whose sign convention is documented in `modules/wallets/service.ts`).

Flow for a send: `AVAILABLE → RESERVED` at message-creation time (inside the same transaction as the Message/MessageRecipient rows) → `RESERVED → CONSUMED` when the provider **accepts** the message (not when it's finally delivered — that's the billing point this system uses, matching how most telecom routes actually charge) → `RESERVED → RELEASED` if the provider rejects it outright, or if it's cancelled before being sent.

## Billing / payments

Payment exists only to top up the SMS wallet — this is not a general payment gateway (no merchant collections, no payouts, no arbitrary money movement). `modules/billing/payment-service.ts::createAndCompletePaymentIntent`:

1. Looks up an existing `PaymentIntent` by `(organizationId, environment, idempotencyKey)` — a DB unique constraint, so a replayed request with the same key returns the already-processed intent without charging or crediting again.
2. Calls `PaymentProvider.charge()` (currently only `SimulatedPaymentProvider`, resolved similarly to the SMS provider but synchronously — payment completion doesn't need the async pattern the SMS simulator needs, since there's no equivalent "real telecom infra calling us back" concern to model).
3. In one transaction: logs a `PaymentTransaction`, updates `PaymentIntent.status`, and — only on `SUCCEEDED` — credits the wallet via `creditWalletTx` (the transaction-aware variant, so the credit is atomic with the status flip). A belt-and-suspenders check inside that branch also refuses to credit twice for the same `PaymentIntent.id` even if this code path were somehow re-entered.

## Webhook architecture

Two independent things share the name "webhook":

- **Inbound** (`POST /api/webhooks/:provider`): a real SMS/payment provider (or, directly, the simulator's own delivery worker) telling us a message's final status. `modules/webhooks/inbound-processor.ts::processProviderDeliveryEvent` is idempotent — a recipient already in a terminal state (`DELIVERED/FAILED/EXPIRED/REJECTED/CANCELLED`) makes a duplicate event a no-op, so a provider retrying its webhook (or our own delayed job firing twice under some pathological retry) can never double-apply a status change. Signature verification (HMAC over the raw body) happens in the route handler before this function is ever called.
- **Outbound** (`modules/webhooks/outbound-dispatcher.ts` + `delivery-sender.ts`): notifying a *customer's* configured `Webhook.url` when a message reaches a terminal status. Each matching, active `Webhook` gets its own `WebhookDelivery` row and its own `webhook-processing` job, HMAC-signed with that webhook's own (encrypted-at-rest) secret, with retry/backoff and an `EXHAUSTED` terminal state once BullMQ's own attempt ceiling is hit.

These two live under different route/module surfaces on purpose — see `docs/provider-integration.md` for the routing note on why customer webhook *configuration* lives at `/api/webhook-endpoints` rather than the more obvious `/api/webhooks`.

## Fraud / rate limiting

`modules/fraud/service.ts::checkSmsSendLimits` runs before the send transaction, checking `SMS_PER_MINUTE`/`SMS_PER_HOUR`/`SMS_PER_DAY`/`ORGANIZATION_QUOTA` `FraudRule` rows against Redis counters (`infrastructure/redis/rate-limiter.ts`, fixed-window `INCRBY`+`EXPIRE NX`) — fast, approximate at window boundaries, which is the right tradeoff for abuse prevention. A rule can be `GLOBAL`, scoped to one `ORGANIZATION`, or (since the schema checklist pass) scoped to one `API_KEY`. Exceeding a `BLOCK` rule stops the send; `FLAG_FOR_REVIEW` also stops it but with a distinct error code; `THROTTLE` logs a `FraudEvent` but lets the send through. `FraudEvent` rows in Postgres are the durable record — Redis counters are never treated as fraud history. `DESTINATION_VELOCITY` and `SPENDING_LIMIT` rule types exist in the schema/seed data but aren't wired into an enforcement point yet (see Known limitations).

## Sandbox vs production

`Environment` (`SANDBOX`/`PRODUCTION`) is a real column on `Wallet`, `ApiKey`, `SenderId`, `Message`, `Campaign`, `PaymentIntent`, `ProviderConfig`, `SimulatorScenario`, `Webhook`, and `IdempotencyRecord` — not a single global mode switch. An API key is permanently pinned to one environment at creation and `verifyApiKeyToken` rejects any attempt to use it where the caller expects the other one. A dashboard session resolves environment per-request (`shared/http/environment.ts::resolveEnvironment`, defaulting to `SANDBOX`) since a human user isn't tied to one. Simulator scenarios and provider configs are matched within their own environment only. Business logic itself never branches on environment — only provider/config *resolution* does, keeping the "no scattered if/else" rule intact for sandbox/production the same way it applies to provider selection.

## File storage abstraction

`infrastructure/storage/file-storage.ts` defines the `FileStorage` interface (`save`/`read`/`delete`/`getUrl`); business code (`modules/documents/service.ts`) depends only on that and a logical `storageKey` string — never an absolute filesystem path. `LocalFileStorage` is the only implementation today, storing under `LOCAL_STORAGE_PATH` with path-traversal protection on every key. Swapping in `CloudinaryFileStorage` later means implementing the interface and adding one case to `infrastructure/storage/index.ts`'s factory — no changes to the documents domain.

## Failure / retry behavior

- **SMS send**: `modules/messaging/send-processor.ts` distinguishes permanent provider rejections (`REJECTED` — fail immediately, no retry) from transient ones (`TIMEOUT`/`ERROR`/circuit-open — retried up to `ProviderConfig.retryCount`, with the recipient set back to `QUEUED` and the BullMQ job itself re-thrown so the queue's own exponential backoff governs timing). Circuit breaker failures short-circuit without even calling the provider once it's open.
- **Outbox publish**: exponential backoff capped at 5 minutes, up to 10 attempts, then `FAILED` (terminal, requires manual intervention today).
- **Outbound webhooks**: BullMQ-level retry/backoff (5 attempts, exponential, 2s base); `EXHAUSTED` on the final failed attempt.
- **Payments**: no retry loop — a `TIMEOUT`/`PROVIDER_UNAVAILABLE` outcome from the payment provider is terminal for that `PaymentIntent`; the customer initiates a new one (with a new idempotency key).

## Security model

- Passwords: argon2id (`modules/auth/services/password-service.ts`), tuned parameters above the library default.
- Sessions: random 32-byte token, only the SHA-256 hash stored (`Session.tokenHash`), httpOnly/secure(prod)/sameSite=lax cookie, server-side revocation list (not pure JWT statelessness) so a compromised token can be killed immediately.
- API keys: `sk_test.<publicId>.<secret>` / `sk_live.<publicId>.<secret>` — only a SHA-256 hash of the secret is stored, looked up by the plaintext `publicId` prefix. Environment is baked into the key and enforced at verification time.
- Secrets needing later decryption (webhook signing secrets, provider credentials) use AES-256-GCM (`shared/utils/encryption.ts`), distinct from the one-way hashing used for tokens/passwords/API keys.
- Structured logging (Pino) redacts `password`/`token`/`apiKey`/`secret`/`authorization`/`cookie`-shaped fields at any depth (`infrastructure/logging/logger.ts`) — but the actual discipline is upstream of that: nothing in this codebase ever passes a raw secret into a log call in the first place.
- Every mutating admin action and every sensitive customer action writes an `AuditEvent` (`modules/audit/service.ts`) — actor, action, resource, metadata, IP, user agent. Audit-write failure never fails the operation it's describing (logged, not thrown) unless the caller explicitly wants it atomic with a state change (passes `tx`).
- Errors are typed (`AppError` + `ErrorCode`); anything that isn't an `AppError` becomes an opaque 500 with no stack trace or internal detail leaked to the client (`shared/http/response.ts::errorResponse`).

## Known limitations

- No real SMS or payment provider is implemented — only the simulators. See `docs/provider-integration.md` for what a real integration needs to do.
- No email or MFA/phone-verification provider is configured — authentication is email+password+session only. Password reset has no working delivery path (see `docs/architecture.md` → "Auth" note above, and `CLAUDE.md`).
- No `CloudinaryFileStorage` implementation yet — only local disk storage.
- Platform-admin permissions have no finer split (e.g. read-only support role) — `isPlatformAdmin` is all-or-nothing.
- `DESTINATION_VELOCITY` and `SPENDING_LIMIT` fraud rule types exist in the data model but aren't enforced anywhere yet.
- Outbox events that exhaust their retry budget (`FAILED`) require manual investigation — there's no alerting/dashboard for this today.
- Per-contact template personalization isn't supported — `MessageRecipient` has no per-row content field, so a campaign's content is uniform across every recipient in a batch.
- No automated migration-safety tooling beyond Prisma's own AI-agent consent gate for destructive operations (which this project relies on directly — see the note in `CLAUDE.md` about resetting the local dev database).
