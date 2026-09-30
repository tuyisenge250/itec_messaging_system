# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A multi-tenant, Rwanda-focused SMS Gateway platform (modular monolith on Next.js). Verified businesses (`Organization` = the tenant) request Sender IDs, buy SMS credits, and send transactional/bulk SMS/campaigns via dashboard or REST API. SMS and payment providers are abstracted behind interfaces with a fully-simulated implementation for local dev — no real telecom/payment credentials exist yet. See `docs/architecture.md`, `docs/message-flow.md`, `docs/provider-integration.md`, and `docs/sandbox.md` for the full design writeup.

## Commands

```bash
# Dev server (Turbopack, no --turbopack flag needed on Next 16)
npm run dev

# Background worker process (BullMQ) — separate from the Next.js server, must be run
# alongside it for messages to actually send (see "Queues & workers" below)
npm run worker           # or: npm run worker:dev (auto-restart)

# Database (point DATABASE_URL/REDIS_URL in .env at your own local Postgres/Redis —
# there is no Docker Compose setup; this project intentionally does not use one)
npm run db:migrate       # prisma migrate dev — interactive, creates+applies a migration
npm run db:migrate:deploy  # prisma migrate deploy — non-interactive, applies pending migrations
npm run db:generate      # regenerate the Prisma client after schema.prisma changes
npm run db:seed          # tsx prisma/seed.ts — safe to re-run, upserts on natural keys
npm run db:studio        # prisma studio

# Quality gates
npm run typecheck        # tsc --noEmit — run this after any change, it's the fastest signal
npm run lint              # eslint
npm test                  # vitest run — integration-style, hits your real local Postgres/Redis
npx vitest run tests/auth.test.ts   # single test file
npx vitest run tests/sandbox.test.ts   # sandbox onboarding/send/retry/idempotency lifecycle
npx vitest run -t "rate limits"     # single test by name
```

There is no separate `build` check needed for correctness during development — `typecheck` catches nearly everything `next build` would, much faster.

## Architecture

### Module layout

`app/` holds only routing (`app/api/**/route.ts` handlers, thin) and the minimal customer/admin pages. Everything else lives in three top-level trees, all resolved via the `@/*` → repo-root path alias:

- `modules/<domain>/` — one folder per business domain (`auth`, `organizations`, `documents`, `sender-ids`, `wallets`, `billing`, `messaging`, `campaigns`, `contacts`, `templates`, `providers`, `simulator`, `webhooks`, `fraud`, `api-keys`, `audit`). Each domain has `repository.ts` (the only file allowed to call Prisma directly), `service.ts` (business logic — permission checks, orchestration, the actual thing route handlers call), and often `validation.ts` (Zod schemas).
- `infrastructure/` — Prisma client singleton, Redis client + rate limiter, BullMQ queue definitions, structured logger (Pino), env validation, local file storage.
- `shared/` — cross-cutting: `errors/` (typed `AppError` + `ErrorCode`), `http/` (the `withRoute` wrapper every route handler uses, standard `{success, data|error}` response shape), `constants/` (`PermissionCode`, `RoleName`), `utils/` (phone normalization, SMS segmentation, crypto/encryption helpers), `types/actor-context.ts` (see below).
- `workers/` — standalone BullMQ worker entrypoint (`workers/main.ts`), separate process from the Next.js server. Run `npm run worker` alongside `npm run dev` or nothing actually sends.

Route handlers are intentionally thin: parse input with a Zod schema from `modules/<domain>/validation.ts`, resolve the actor via `getActorContext`/`getSessionActorContext`/`getApiKeyActorContext`, call one `modules/<domain>/service.ts` function, return via `ok()`/`created()`. All business logic, permission checks, and Prisma calls live in `modules/`, never in `app/api/**`.

### Multi-tenancy and authorization

`Organization` is the tenant; `organizationId` is **never** trusted from a client-supplied path/body param on its own. Every request builds an `ActorContext` (`shared/types/actor-context.ts`) from either a session cookie or an `Authorization: Bearer` API key (`modules/auth/services/request-context-service.ts`), which resolves `organizationId` from real membership/API-key rows. Every domain service calls `assertOrganizationAccess(actor, organizationId)` and, for a loaded row, `assertResourceBelongsToOrganization(row.organizationId, organizationId)` before touching data — both in `modules/auth/services/authorization-service.ts`.

RBAC is fully DB-driven: `Role` → `RolePermission` → `Permission` tables (seeded in `prisma/seed.ts`), not a hardcoded switch. `assertPermission(actor, PermissionCode.X)` joins through the DB for a session user, checks `ApiKey.scopes` for an API-key actor, and short-circuits true for `User.isPlatformAdmin` (platform staff bypass org-role permissions entirely — see `requirePlatformAdmin`). Never compare `role.name` or `membership.role` directly in application code; always go through a `PermissionCode`.

### Prisma 7 specifics (don't assume older Prisma behavior)

- Generator is `provider = "prisma-client"` (not `prisma-client-js`), output at repo-root `generated/prisma/` (gitignored). Import the client's types from `@/generated/prisma/client`, not from the `@prisma/client` package directly.
- The client has **no bundled query-engine binary** — it requires an explicit driver adapter. `infrastructure/database/prisma.ts` constructs it with `new PrismaPg(pgPool)` over a `pg.Pool` we own and size ourselves.
- CLI config lives in `prisma7.config.ts` (not a `datasource.url` in `schema.prisma` — that block only has `provider = "postgresql"`). The CLI reads `DATABASE_URL` via `dotenv/config` in that file.
- The `prisma` CLI itself is pinned to `7.10.0` exact — `npm install prisma` alone resolves to a `8.0.0-rc.*` built around Prisma's cloud "Developer Platform," which is the wrong fit here.
- Money is stored as `Int` "minor units" (RWF has no real subunit, so 1 minor unit = 1 RWF) — never floating point. Documented as a deliberate scale tradeoff in `docs/architecture.md`; `BigInt` is the noted upgrade path if ever needed.

### Wallet / ledger

`Wallet.availableBalanceMinorUnits` / `reservedBalanceMinorUnits` are updated only via atomic conditional `updateMany` calls in `modules/wallets/repository.ts` (`tryReserve`/`release`/`consumeReserved`) — Postgres's own row-level UPDATE serialization is what prevents concurrent overspend, not application-level locking. Every balance change writes an immutable `WalletLedgerEntry` in the same transaction. Billing point for a send is **provider acceptance** (`SENT`), not final delivery — a reservation is `CONSUMED` when the provider accepts the message and `RELEASED` if it's rejected before/at submission; final delivery outcome never touches the wallet again. `creditWalletTx(tx, ...)` must be used (not the standalone `creditWallet`) when crediting inside a transaction you already opened (e.g. payment success) — nesting a fresh `prisma.$transaction` inside one already open silently does not participate in it.

### Messaging pipeline / transactional outbox

`modules/messaging/service.ts::sendMessage` does pricing lookup, fraud rate-limit checks, phone normalization/segmentation, and — in one Prisma transaction — creates `Message` + `MessageRecipient` rows, reserves wallet credit per recipient, and writes an `OutboxEvent`. Outside that transaction it makes a best-effort immediate publish (`modules/outbox/service.ts::tryPublishImmediately`) to BullMQ; a repeatable poller worker (`workers/outbox-poller-worker.ts`) sweeps up anything that failed to publish immediately, with exponential backoff via `OutboxEvent.nextAttemptAt`. Never enqueue a BullMQ job directly from a route handler for a message send — always go through the outbox.

Queues (`infrastructure/queues/queue-names.ts`): `sms-send` (one job per recipient, `jobId = recipientId` for free dedup), `sms-delivery` (delayed job simulating async provider callback), `outbox-publish` / `scheduled-messages` (repeatable pollers), `webhook-processing` (outbound customer webhook dispatch with retry). Job payloads are IDs only — workers always reload from Postgres.

### Provider abstraction & simulator

`modules/providers/sms-provider.ts` defines `SmsProvider` (`sendSms`/`getDeliveryStatus`); `modules/providers/factory.ts::resolveSmsProvider` is the **only** place that maps a `ProviderConfig.providerCode` DB row to a concrete adapter — this is what "config-driven provider resolution instead of if/else on provider name" means here. Currently only `"simulator"` (`modules/simulator/simulator-sms-provider.ts`) is implemented.

The simulator plays both sides of a real provider: `sendSms()` returns an immediate accept/reject (matching scenario rows in `SimulatorScenario`, admin-managed, matched by `modules/simulator/scenario-matcher.ts`), and on ACCEPTED it also schedules its own delayed `sms-delivery` job — because there's no real telecom infra to call our webhook back. That delayed job calls `modules/webhooks/inbound-processor.ts::processProviderDeliveryEvent` **directly** (not via HTTP to `POST /api/webhooks/simulator`) to stay deterministic/testable while still running through the identical status-update/aggregate-recompute/outbound-dispatch pipeline a real provider's webhook would hit through that HTTP route. Circuit breaker state (`modules/providers/circuit-breaker.ts`) and rate limiting live in Redis, keyed per provider+environment — never in Postgres.

### Sender ID workflow

`SenderIdRequest` (the workflow object: `DRAFT` → ... → `APPROVED`/`REJECTED`/`CANCELLED`, state machine in `modules/sender-ids/state-machine.ts`) is a **separate model** from `SenderId` (the live, approved resource messages actually reference, `ACTIVE`/`SUSPENDED`/`EXPIRED`/`CANCELLED`). Approval (`approveSenderIdRequest`) atomically creates the `SenderId` row and links it back via `SenderIdRequest.approvedSenderIdId`. A `RURA_APPROVED` status here is only this system's record that internal review reached that step — never present it as a real regulatory approval.

### Auth — current scope

Email + password + secure (hashed, httpOnly-cookie) session only. **Email verification and MFA are intentionally not implemented** — no email/SMS/MFA provider is configured at this stage, and the code has no `emailVerifiedAt`-style gate anywhere. Password reset keeps its token architecture but has no working delivery path yet (no email provider); the actual working reset mechanism right now is admin-initiated (`POST /api/admin/users/:id/reset-password`, requires `ADMIN_USERS_MANAGE`, revokes all sessions). Don't reintroduce MFA/email-verification checks piecemeal — if re-adding either, do it as a self-contained service the way `password-service.ts`/`session-service.ts` are structured, not scattered gates.

### Environment (sandbox vs production)

`Environment` (`SANDBOX`/`PRODUCTION`) is a real column on `Wallet`, `ApiKey`, `SenderId`, `Message`, `Campaign`, `PaymentIntent`, `ProviderConfig`, `SimulatorScenario`, `Webhook`, `IdempotencyRecord` — not a global flag. An API key is permanently pinned to one environment (checked in `verifyApiKeyToken`); a dashboard session resolves it per-request via `shared/http/environment.ts::resolveEnvironment` (defaults to `SANDBOX`). Simulator scenarios only match within their own environment. `Contact`/`ContactGroup`/`Template` have no environment column — they're org-wide by design (a phone number isn't sandbox-or-production).

Every new organization automatically gets a working sandbox — sender ID, starting credit, API key — with no approval workflow; see `docs/sandbox.md` for the full onboarding flow, the deterministic test-number table (`+250700000001`..`008`, configurable via `SANDBOX_*` env vars), and how to exercise delivery/failure/retry/idempotency locally. `modules/organizations/onboarding-service.ts` is the entry point.
