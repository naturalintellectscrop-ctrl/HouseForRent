# House For Rent

A digitally managed rental marketplace for Uganda by **Natural Intellects Limited**: property discovery with field-officer verification, staff-coordinated viewings, agreement-backed deals with snapshot-frozen terms, a double-entry financial ledger (rent/deposit/commission), move-in verification, deposit lifecycle, and administrative operations with append-only audit trails.

Live: https://houseforrentug.vercel.app

## Stack

- Next.js 16 (App Router, React 19, TypeScript 5) — one monolith (`src/`)
- PostgreSQL (Supabase) via Prisma 6; local dev/test rigs use PGlite (Postgres 16 WASM)
- NylonPay SDK (payments); sharp (image pipeline); bcryptjs (credentials)
- Deployed on Vercel (push to `main`)

## Start here

| Document | Purpose |
|---|---|
| [`docs/DEVELOPER_ONBOARDING.md`](docs/DEVELOPER_ONBOARDING.md) | **Main onboarding**: setup, architecture tour, FAQ, test commands, production-safety doctrine |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Technical architecture, stack versions, system boundaries |
| [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) | Product purpose, users, workflows, revenue model |
| [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md) | Verified capabilities, gaps, prioritized roadmap |
| [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) | Backup/restore runbook — **read before any data-touching change** |
| [`worklog.md`](worklog.md) | Round-by-round engineering continuity record |

## Quick start (local, no production contact)

```bash
bun install
bun scripts/dev-local-stack.mjs &        # local PGlite Postgres on 127.0.0.1:54321
export DATABASE_URL='postgres://dev:dev@127.0.0.1:54321/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60'
bun run dev                              # http://localhost:3000
```

Copy `.env.example` to `.env` for the full variable reference (names only).

## Rules that keep this codebase safe

- **Never** `prisma db push` or run migrations against production — schema changes go through reviewed additive migrations via `scripts/apply-migration.mjs` only (`scripts/db-push-guard.mjs` blocks `db:push` on production URLs).
- **Never** connect cleanup/dev tooling to production: two-key rails (`ALLOW_PROD_MIGRATION`, `ALLOW_DB_RESTORE`) gate every dangerous operation.
- Money is BigInt UGX shillings everywhere (`src/lib/money.ts`); corrections are new reversing postings, never edits — ten financial/audit tables are DB-enforced append-only.
- Regression suites live in `scripts/*-tests.mjs` — run them before and after any server-side change (commands in the onboarding doc).
