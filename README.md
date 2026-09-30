# SMS Gateway

A multi-tenant, Rwanda-focused SMS Gateway backend — organizations, Sender ID compliance workflow, SMS credit wallet, transactional/bulk messaging, campaigns, a fully-simulated SMS/payment provider pair, fraud/rate limiting, and a minimal customer/admin console over it. See `CLAUDE.md` for an architecture orientation and `docs/` for the full design writeup (`architecture.md`, `message-flow.md`, `provider-integration.md`).

No real SMS or payment provider is wired in — everything runs against a simulator so the whole pipeline (send → provider accept → async delivery → webhook → wallet consumption) can be exercised locally. See `docs/provider-integration.md` for what plugging in a real provider later involves.

## Requirements

- Node.js 20.9+ (developed against 22.x)
- Your own local PostgreSQL and Redis instances — there is no Docker Compose setup here; point `DATABASE_URL`/`REDIS_URL` in `.env` at whatever you already run locally.

## Setup

```bash
npm install
cp .env.example .env   # then fill in DATABASE_URL, REDIS_URL, and generate the secrets it asks for

npm run db:migrate     # applies prisma/migrations
npm run db:seed        # creates roles/permissions, a demo org, sender IDs, contacts,
                        # templates, simulator scenarios, fraud rules, and 3 dev users
                        # (all sharing the password printed at the end of the seed run)
```

## Running

Two processes, both required for messages to actually send end to end:

```bash
npm run dev       # Next.js app — http://localhost:3000
npm run worker    # BullMQ workers — sms-send, sms-delivery, outbox-publish,
                   # scheduled-messages, webhook-processing
```

Log in at `/login` with one of the seeded accounts (printed by `npm run db:seed`), or hit the REST API directly — every page under `/dashboard` and `/admin` is a thin client over the same API a programmatic integrator would use.

## Quality checks

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint
npm test              # vitest — integration tests against your real local Postgres/Redis
```

## Project layout

See `CLAUDE.md` for the full breakdown. In short: `app/` is routing only (thin `route.ts` handlers + minimal pages), `modules/<domain>/` holds all business logic (`repository.ts` → Prisma, `service.ts` → the actual logic, `validation.ts` → Zod schemas), `infrastructure/` and `shared/` are cross-cutting, and `workers/` is the standalone BullMQ process.
