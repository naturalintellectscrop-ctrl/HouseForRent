# House For Rent — Developer Onboarding

**Organization:** Natural Intellects Limited · **Repo:** `github.com/naturalintellectscrop-ctrl/HouseForRent`
**Status:** Written 2026-11-11 from a read-only audit at commit `ad93c96` (branch `main`, clean tree, in sync with `origin/main`).

This is the main onboarding document. Read in this order: this file → `docs/ARCHITECTURE.md` → `docs/PRODUCT_OVERVIEW.md` → skim `docs/FEATURE_VERIFICATION_MATRIX.md` (the honest status vocabulary) → `docs/DISASTER_RECOVERY.md` before ever touching production. `worklog.md` (69 rounds) is the continuity record — search it before assuming anything about *why* code looks the way it does.

---

## 1. First hour: local setup (safe — no production contact)

```bash
git clone https://github.com/naturalintellectscrop-ctrl/HouseForRent.git
cd HouseForRent
bun install                     # postinstall runs `prisma generate`
# .env is NOT committed. Copy names from the table in docs/ARCHITECTURE.md §9.
# For local dev you need DATABASE_URL pointing at the LOCAL stack:
bun scripts/dev-local-stack.mjs &   # PGlite Postgres on 127.0.0.1:54321 (seeds 5 Kampala neighbourhoods)
# it prints the exact DATABASE_URL to use, e.g.:
#   postgres://dev:dev@127.0.0.1:54321/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60
export DATABASE_URL='postgres://dev:dev@127.0.0.1:54321/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60'
bun run dev                     # http://localhost:3000
```

- **Media stays local in dev:** the stack sets `MEDIA_STORAGE=local`; never point a dev sandbox at the production Supabase bucket.
- **Known trap:** some sandbox shells export a stale `DATABASE_URL=file:…` (SQLite-era) that **overrides** `.env` — check `env | grep DATABASE_URL` if the app cannot connect. **[Reported by previous agent — worklog Round 68]**
- **There is no seed for a full demo dataset**; `scripts/dev-verify-fixture.mjs` is the maintained fixture path; `scripts/seed-demo.mjs` has drifted (superseded).
- There is **no README, no `.env.example`, and no CI** — this document is the setup guide (P2 items to fix, `docs/RELEASE_READINESS.md`).

## 2. Repository map

See `docs/ARCHITECTURE.md` §10 for the full table. The short version:

- `src/server/**` — **the real system** (domain services). `src/app/api/v1/**` — HTTP handlers (thin: guard → service → typed errors). `src/app/**` pages are server components over `src/lib/api.ts` (read-only in-process adapter) with small client islands using `src/lib/client.ts` for mutations.
- `prisma/schema.prisma` — SSOT for the data model (45 models). `prisma/migrations/` — **only 3 of 6 are applied to production**; the other 3 are DRAFT/owner-gated.
- `scripts/` — operational tooling: the five test suites, DB export/restore/recovery drills, migration rails, read-only production probes, media tools.
- `docs/` — 16 documents (11 prior + 5 from this audit). `worklog.md` — round-by-round history.
- `.zscripts/`, `tests/*.sh`, `examples/`, `Caddyfile`, `apps/web/` — sandbox/scaffold artifacts; read `docs/REPOSITORY_HYGIENE_AUDIT.md` before touching them (`apps/web` is load-bearing for the current Vercel build command override!).

## 3. How the pieces work (short answers)

- **Authentication:** custom cookie sessions (`hfr_session`, httpOnly, SameSite=Lax, secure in prod); opaque 32-byte token, only its SHA-256 hash stored in `session`; bcrypt cost 10; **1-hour idle auto-logout** (sliding, 30-day absolute cap) — `src/server/auth.ts`. Staff accounts are provisioned by an admin (`/platform/settings`), never self-registered.
- **Roles:** `tenant | lister | foo | admin` (`src/server/domain.ts:22`). Enforced four times: HTTP guard (`requireRole`), service-level ownership checks, in-process adapter re-checks, and per-deal-action role matrix (`DEAL_ACTIONS`). Non-party reads are **404, not 403** (existence hiding).
- **Tenants ↔ landlords interact through staff-mediated events:** a tenant requests a viewing → admin dispatches an officer → officer conducts and files the field report → immutable `IntroductionRecord` → officer/admin opens the deal → both parties act on the deal through `availableActions` rendered from the server (no client-side status logic).
- **Viewings:** state machine `requested → scheduled → conducted | no_show | cancelled` (`src/server/viewing-state-machine.ts`); closing a visit without a structured field report is refused server-side; media capture is window-limited to `scheduled`.
- **Deals:** created ONLY from introduction records (`createFromIntroduction`); one ACTIVE deal per introduction (currently a check-then-insert; the DB-enforcing partial unique index is DRAFT migration `20261028120000`, whose predicate excludes exactly the four terminal statuses `closed/cancelled/refunded/reversed` — verified verbatim this audit).
- **Payments:** `fund-escrow` derives the amount from deal snapshots (client-supplied `expectedAmount` is checked, never trusted) → NylonPay collect instruction (idempotency key `fund:{dealId}`) → signed webhook (HMAC raw body, 5-min freshness) → exact-amount/currency guard → custody + commission + deposit case booked in ONE transaction. Sandbox instructions are self-labeled MOCK in the DB.
- **Deposits are protected by construction:** separate `deposit_liability` ledger account + case workflow (landlord proposes → HFR reviews → tenant accepts/disputes → admin applies → release) with in-transaction balance re-checks and a single-pending-release guard. Deposits are never commissionable and never landlord rent proceeds.
- **Commissions:** integer basis-points of one month's rent from the append-only `CommissionRateVersion` table; paid by the landlord; earned once, inside the confirmed-payment transaction; reversals only in the two approved categories. ⚠ **The deployed bootstrap default is 10000 bp (one full month), not 10%** — see `docs/RELEASE_READINESS.md` P0-2 before your first real deal.
- **Refunds & reversals:** refund kinds (`full_pre_settlement`, `partial_pre_settlement`, `duplicate_payment`, `deposit_refund`, `commission_reversal_payout`) with `pending → confirmed | failed` records; retries only for FAILED records with fresh idempotency keys; provider clawback posts exact reversing postings and terminates as `reversed`; post-settlement unearned rent is a landlord-side coordination record with no platform balance.
- **Ledger integrity:** every posting balances (Σdebits = Σcredits) validated before write; corrections are new reversing postings; balances derived, never stored; every money transition is status + ledger + audit in one transaction with a CAS prior-status re-check.

## 4. Developer FAQ

**Q: What is the frontend/backend stack?**
One Next.js 16 (App Router, React 19, TypeScript 5) monolith on Vercel; PostgreSQL 17.6 on Supabase via Prisma 6; local rigs use PGlite (Postgres-16-WASM). No separate API service. See `docs/ARCHITECTURE.md`.

**Q: How does authentication work?** Custom session cookie + DB `session` table (hash-stored token), bcrypt credentials, admin-provisioned staff, 1-hour idle expiry. next-auth is an unused dependency.

**Q: How are roles enforced?** `requireRole` at the HTTP edge + service-level checks + adapter re-checks + the `DEAL_ACTIONS` matrix. Pages are convenience gates only ("the API re-authorizes everything" — comment in `src/lib/session.ts`).

**Q: How is the database structured?** Prisma schema is SSOT (45 models). Money is BigInt UGX shillings. Ten append-only tables are DB-enforced immutable by triggers that live **outside** Prisma (`scripts/recovery-triggers.sql`).

**Q: How do tenants and landlords interact?** Never directly for transactions: all money moves through the ledger; all introductions are officer-evidenced. The portals are views on the same server-derived state.

**Q: How are viewing requests managed?** Tenant requests (identity-verified tenants only) → admin dispatch (`/ops/dispatch`) → officer conducts with report + media → close → optional deal.

**Q: How are deals created and advanced?** `POST /api/v1/deals` with `introductionRecordId` only (foo/admin); advancement via `POST /api/v1/deals/:id/:action` against the `DEAL_ACTIONS` catalogue; every transition is graph-guarded, role-checked, CAS-protected, and audited.

**Q: How are payments verified?** NylonPay webhook: HMAC signature over the raw body (SDK-enforced 5-minute freshness) → 401 invalid / 503 unconfigured (fail-closed) → currency+exact-amount guard → forward-only instruction state machine → booking only from `transaction.successful` with a matching pending instruction.

**Q: How are deposits protected?** Separate custody account, case workflow with dispute path, in-transaction balance re-checks, single pending release, close-only-at-zero.

**Q: How are commissions calculated?** `monthlyRentSnapshot × commissionRateBpSnapshot / 10000` (integer), computed at signing-time snapshot and earned at confirmed payment; deposit excluded; once per deal; no renewal path exists.

**Q: How do refunds and reversals work?** Ledger-bounded refunds with typed records and retry discipline; duplicate-payment refunds return never-booked money (no ledger rows); provider reversals post exact reversing postings; commission reversal is category-gated (`COMMISSION_RETENTION_POLICY_PENDING` otherwise).

**Q: How do we run tests?** Five self-contained suites, each booting its own PGlite rig + real `next dev` and driving the real HTTP surface (they kill stray dev servers on :3111 — don't run while another rig is up):

| Suite | Command | Checks | Covers |
|---|---|---|---|
| Finance pipeline | `bun scripts/finance-pipeline-tests.mjs` | 166 | 20 mandated money scenarios + adversarials + Phase-2 ops |
| Authorization regression | `bun scripts/authz-regression-tests.mjs` | 67 | Role boundaries HTTP+pages, no-show discipline, dry-run ownership, rate limits |
| KYC pipeline | `bun scripts/kyc-pipeline-tests.mjs` | 80 | Terms gate, evidence privacy, submission matrix, decisions |
| Deal uniqueness | `bun scripts/deal-uniqueness-tests.mjs` | 18 | Applies the amended DRAFT migration verbatim; races + terminal retries |
| Image pipeline | `bun scripts/image-pipeline-tests.mjs` | 38 | Upload validation, EXIF stripping, variants, deletion, orphan sweep |

Standing gates every round: `npx tsc --noEmit` (0) and `bun run lint` (0). Last recorded full pass: Round 67 (`ee8ce44` commit message) **[Verified by automated test — reported; not re-executed in this audit]**.

**Q: How do we deploy?** Push to `main` → Vercel builds (framework preset). The `apps/web` workspace shim must stay until the stale Vercel Build Command override (`npm run build --workspace @hfr/web`) is cleared in the dashboard. Verify via the GitHub commit status + a live check. There is no other deploy path — the `.zscripts` sandbox chain is legacy (hygiene audit).

**Q: How do we safely create migrations?** Additive SQL under `prisma/migrations/<timestamp>_<name>/migration.sql` with a header documenting purpose/rollback/status; **never** `prisma db push` against production (`scripts/db-push-guard.mjs` refuses); apply only through the rails: `TARGET_DATABASE_URL=… ALLOW_PROD_MIGRATION=yes node scripts/apply-migration.mjs prisma/migrations/<dir>/migration.sql` (refuses re-application; writes an honest `_prisma_migrations` row atomically with the DDL). Keep DRAFT migrations unapplied until the owner authorizes; run the §2a backup loop first — `docs/DISASTER_RECOVERY.md` §2a is the mandatory procedure for every data-touching change.

**Q: Which parts must not be changed casually?** `docs/ARCHITECTURE.md` §11 list: append-only tables, deal snapshot columns, `PspInstruction` state semantics, enum value additions (irreversible), the partial unique index (unmodelable in Prisma), the commission-rate versioning, BigInt money discipline, and the mutation-free in-process adapter.

**Q: Which integrations are not yet live?** Person identity verification (mock), NylonPay payouts (not wired), live deposit custody (flag off), provider statement fetch (manual import), email/notifications (none), custom domain (pending).

**Q: What are the current release blockers?** `docs/RELEASE_READINESS.md` §8 — headline: off-host backup copy, commission-rate decision, three DRAFT migrations, identity provider, NylonPay KYC/payouts, custody/legal approval, counsel review of terms/privacy, domain/DNS, CI.

## 5. Production safety doctrine (read before ANY production operation)

1. **Two-key conventions everywhere:** `ALLOW_PROD_MIGRATION`, `ALLOW_DB_RESTORE`, `ALLOW_PRODUCTION_PURGE`, `ALLOW_ORPHAN_DELETE` + explicit target URLs. If a command doesn't demand a second key, it isn't meant to touch production.
2. **Read-only probes are the only casual production contact:** `scripts/verify-prod-db.mjs`, `scripts/verify-prod-finance-state.mjs`, `scripts/prod-gate-db-probe.mjs` (note: its trigger-count query is stale — triggers are named `<table>_immutable`, not `reject_mutation`).
3. **Credentials:** env-only, never echoed, never committed. `.env.prod` (gitignored, chmod 600) holds the production pooler URL. Rotation of the Round-69 chat-exposed credentials is still recommended. **[Reported by previous agent]**
4. **The §2a backup loop gates every data-touching change:** preflight identity → export → `gunzip -c | sha256sum` (the sidecar is the **decompressed-stream** digest — plain `sha256sum -c` on the `.gz` fails) → metadata record → off-host copy → second digest → same-day `production-recovery-drill.mjs`. Current backup status: first verified export 2026-11-11 exists **in the sandbox only**; off-host copy pending owner action.
5. **Restore goes into a recovery database, never over production.** `scripts/verify-restored.mjs` is **STALE — do not use** (fails loudly on real Postgres).

## 6. Gotchas that will bite a new developer

- **Dual lockfiles:** `bun.lock` (scripts/docs use bun) and `package-lock.json` (the Vercel override uses npm). Don't mix; consolidation pending the override cleanup.
- **Scaffold naming:** `package.json` name is `nextjs_tailwind_shadcn_ts`; `apps/web` contains no code; `src/components/ui` (shadcn, 48 files), `tailwind.config.ts`, framer-motion, next-auth, zod, zustand, react-query etc. are **unused** by the product (hand-written CSS system instead).
- **`tests/*.sh` and `examples/websocket` are scaffold artifacts** (the socket.io demo isn't even installable — socket.io isn't a dependency).
- **`.gitignore` foot-guns:** entries `test`, `prompt`, `local-*`, `--full-page` ignore same-named files anywhere (one `local-*` script was silently swallowed once — worklog 1269).
- **`.zscripts/` is tracked despite the gitignore entry** — untracked-by-gitignore does not untrack committed files. See the hygiene audit.
- **Worklog format shift:** rounds ≤64 are `## Task ID: N` blocks; rounds 65–69 are `## Round N` headings.
- **The first ~200 lines of `worklog.md` describe the ORIGINAL repo layout** (`_legacy/`, NestJS `apps/api`) — historical context, not current state.
- **No `error.tsx` boundaries** exist — expected failures are handled per-fetch; unexpected render throws hit Next's default error UI.
- **`prod-gate-db-probe.mjs` trigger query is stale** (searches `tgname='reject_mutation'` → 0 rows); the corrected capture is `scripts/recovery-triggers.sql`.
- **`scripts/verify-restored.mjs` is stale** (see above); **`seed-demo.mjs` drifted**; **`qa-journey.mjs` is partially historical** (SQLite-era guards).
- **The commission default (10000 bp) is not the policy's "10%"** — never quote a rate without checking `GET /api/v1/commission-rate` and the version table.

## 7. Where to make which change (normal work)

| Change | Where | Care |
|---|---|---|
| UI/copy on public pages | `src/app/(site)/**` | Respect `docs/VALUE_PROPOSITION_MATRIX.md` copy rules — never claim more than evidence proves |
| Portal screens | `src/app/(portal)/**` | Actions come from server `availableActions`; keep client validation advisory |
| New mutation endpoint | `src/app/api/v1/...` + service in `src/server/**` | Guard + typed errors + audit row in the same transaction; add to the authz suite |
| New read for server components | `src/lib/api.ts` resolver | Must carry the same role rules as any HTTP route (P-1 lesson) |
| Schema change | `prisma/schema.prisma` + reviewed additive migration | Never `db push` to prod; §2a loop first |
| Money logic | `src/server/finance/**`, `deals.ts`, `ledger.ts`, `domain.ts` | Extend the finance suite; snapshots only; reversing postings only |
| Media | `src/server/media*.ts`, `image-pipeline.ts` | Keep provenance + privacy behavior; image suite |
| Rate limiting windows | `src/server/rate-limit.ts` | Durable layer fails open until migration applied — don't "fix" the fail-open without reading the round-66 rationale |
| Ops scripts | `scripts/**` | Read `docs/DISASTER_RECOVERY.md` first; recovery-critical scripts list in the hygiene audit |
