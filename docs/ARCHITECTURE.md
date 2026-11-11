# House For Rent — Technical Architecture

**Status:** Written 2026-11-11 from a read-only audit at commit `ad93c96`. Labels: **[Verified in source code]**, **[Verified in production]** (2026-11-11 preflight artifact / live HTTP check this audit), **[Reported by previous agent]**, **[Inferred or unverified]**.

Companion: `docs/DEVELOPER_ONBOARDING.md` (operating procedures), `docs/PRODUCT_OVERVIEW.md` (what it is), `docs/FINANCIAL_ARCHITECTURE.md` (money-domain design record — authoritative for ledger details), `docs/DISASTER_RECOVERY.md` (backup/restore runbook).

---

## 1. High-level architecture diagram

```
                        ┌──────────────────────────────────────────────────────────┐
                        │                       VERCEL (hosting)                    │
                        │   Next.js 16 App Router · Node runtime · standalone build │
                        │   https://houseforrentug.vercel.app   (custom domain TBD) │
                        └───────────────┬──────────────────────────────────────────┘
                                        │
      ┌─────────────────────────────────┴───────────────────────────────────┐
      │                    ONE Next.js MONOLITH  (src/)                      │
      │                                                                      │
      │  Route groups (server-rendered RSC + small client islands):          │
      │   (site)/     public marketplace        login/ register/             │
      │   (portal)/   tenant /account  landlord /landlord                    │
      │   ops/        staff console (FOO + admin sections)                   │
      │   platform/   owner control center (admin-only, "stealth")           │
      │                                                                      │
      │  TWO read paths:                                                     │
      │   • Server components → src/lib/api.ts adapter → src/server/*        │
      │     (in-process, mutations forbidden)                                │
      │   • Client islands → HTTP fetch → /api/v1/* route handlers           │
      │     (all mutations)                                                  │
      │                                                                      │
      │  Domain services  src/server/: listings viewings deals ledger        │
      │    finance/* kyc ops mandates media media-storage image-pipeline     │
      │    nylonpay auth rate-limit activity http errors  domain.ts          │
      └───┬───────────────┬──────────────┬─────────────────┬────────────────┘
          │               │              │                 │
          ▼               ▼              ▼                 ▼
 ┌────────────────┐ ┌───────────┐ ┌────────────────┐ ┌──────────────────────┐
 │ PostgreSQL 17.6│ │ Supabase  │ │ NylonPay (PSP) │ │ (no email/notification│
 │ (Supabase,     │ │ Storage   │ │ collect: SDK + │ │  channel implemented)│
 │ session pooler │ │ private   │ │ signed webhook │ └──────────────────────┘
 │ via Prisma 6)  │ │ "media"   │ │ /api/v1/payments│
 │ prod: 49 tables│ │ bucket    │ │  /nylonpay/    │
 │ + ba_* tables, │ └───────────┘ │     webhook    │
 │ _applied_      │               └────────────────┘
 │ migrations,    │
 │ 10 append-only │      ┌──────────────────────────────────────────────┐
 │ *_immutable    │      │ LOCAL DEV / TEST RIG (never touches prod):    │
 │ triggers       │      │ PGlite (Postgres 16 WASM) + next dev on      │
 └────────────────┘      │ random/fixed ports; suites boot their own rig │
                         └──────────────────────────────────────────────┘
```

**[Verified in source code]** for all code elements; **[Verified in production]** for PostgreSQL 17.6 / 49 tables / append-only triggers (2026-11-11 preflight + trigger-DDL capture committed as `scripts/recovery-triggers.sql`); Vercel hosting **[Verified in production]** (live 200 check this audit; deployment record in commit `ad93c96`).

## 2. Stack and versions

All versions from `package.json` / lockfiles **[Verified in source code]**. "Used?" reflects actual imports in `src/`:

| Technology | Version | Role in HFR | Where | Notes / limits |
|---|---|---|---|---|
| Next.js | `^16.1.1` | Full-stack framework (App Router; RSC + route handlers) | `src/app/**` | `output: "standalone"`; Turbopack; CSP/headers in `next.config.ts` |
| React | `^19.0.0` | UI | — | Server components dominate; ~44 small client islands |
| TypeScript | `^5` | Language (strict) | everywhere | `npx tsc --noEmit` is a standing gate (0 errors recorded) |
| Tailwind CSS | v4 in devDeps | **Installed but NOT used by product UI** | `tailwind.config.ts` orphaned | Product UI is a hand-written ~5,000-line CSS system (`src/app/globals.css`); shadcn/ui (48 components in `src/components/ui`) also **unused** — scaffold residue (`docs/REPOSITORY_HYGIENE_AUDIT.md`) |
| Prisma + `@prisma/client` | `^6.11.1` | ORM; schema SSOT | `prisma/schema.prisma` (45 models / 42 enums) | Runtime hardening for Supabase pooler in `src/lib/db.ts` |
| PostgreSQL | 17.6 (Supabase) | Production database | session pooler | 49 public tables; `ba_*` + `_applied_migrations` out-of-band; 10 `<table>_immutable` triggers + `viewing_conducted_requires_evidence` + `rls_auto_enable` **[Verified in production]** |
| PGlite (`@electric-sql/pglite` + `-socket`) | 0.5.x / 0.2.x (devDeps) | Local Postgres-16-WASM test/dev rig | `scripts/dev-local-stack.mjs`, `scripts/test-rig.mjs`, suites | No Docker needed; real wire protocol |
| `bcryptjs` | `^3.0.3` | Password hashing (cost 10) | `src/server/auth.ts` | Dummy-hash timing equalization |
| `@nile-squad/nylonpay-ts` | `^2.0.1` | PSP SDK (collect + webhook signature) | `src/server/nylonpay.ts` | Payout API **not** wired |
| `sharp` | `^0.34.3` | Image renditions (WebP thumb/card/detail) | `src/server/image-pipeline.ts` | `serverExternalPackages` in `next.config.ts` |
| `next-themes`, `next-auth@4`, `next-intl`, `zod`, `zustand`, `@tanstack/react-query`, `framer-motion`, `z-ai-web-dev-sdk`, recharts, dnd-kit, embla, MDX editor, react-syntax-highlighter, uuid, react-markdown, react-day-picker, react-hook-form, sonner, vaul, input-otp, cmdk, chart libs | various | **Installed but unused by product code** | package.json only | Verified unused via repo-wide import search (agent traces in `docs/REPOSITORY_HYGIENE_AUDIT.md`); prune candidates |
| Bun | 1.3.x (lockfile) | Script/test runner, dev server | `bun.lock` | npm ALSO active for Vercel build path (`package-lock.json`) — dual lockfiles, see onboarding doc |
| ESLint | `^9` + `eslint-config-next` | Lint gate | `eslint.config.mjs` | `bun run lint` — 0 errors recorded |
| Vercel | framework preset | Hosting + deploy-on-push | `vercel.json` (minimal), stale build-command override satisfied by `apps/web` shim | No CI beyond Vercel build (`.github` absent) |

## 3. Frontend and rendering architecture

**[Verified in source code]**

- **App Router, route-group monolith.** One Next.js app; no `apps/api` (the brief's `apps/web` is an empty Vercel build-command shim). Route groups: `(site)` public, `(portal)` tenant+landlord (gated by `requireRole` in layouts), `ops` staff, `platform` admin control center.
- **Server-first rendering.** Pages are React Server Components calling domain services **in-process** through `src/lib/api.ts` (`apiGet` → `resolverFor`), which re-runs role checks (`requireCaller`/`requireStaffCaller`/`requireAdminCaller`) and **refuses mutations** (`MUTATION_NOT_ALLOWED`). Field-work pages deliberately ship zero client JS where possible (rationale: field officers on mobile data in Kampala — comments in `src/app/ops/today/page.tsx`).
- **Client islands** (`src/lib/client.ts` `postJson/postFile/getJson`) perform **every mutation** over real HTTP to `/api/v1/*`, plus a few reads. ~38 client modules use it.
- **Design system.** Hand-written CSS token system in `src/app/globals.css` (roof-red/forest-green palette sampled from the logo, `.btn/.card/.badge/.pill/.trail/.shell*`, two density registers, WCAG-checked colors documented inline); mobile drawer (`src/app/app-shell-drawer.tsx`), no-JS `<details>` mobile menu, skip link, `aria-live` gallery, labelled status badges. Light-only product by owner decision (`src/app/layout.tsx`); the platform center has its own scoped light/system/dark switch (`src/app/platform/platform-theme.tsx`).
- **SEO.** `src/lib/seo.tsx` (canonical/OG/JSON-LD incl. `RealEstateListing`), generated `sitemap.ts` + `robots.ts` (disallows `/api/`, `/account`, `/landlord`, `/ops` — note `/platform` relies on `noindex` metadata instead, a minor asymmetry).
- **Error/loading coverage:** 4 `loading.tsx` skeletons, 2 `not-found.tsx`, **0 `error.tsx` boundaries** (pages handle expected failures per-fetch with try/catch; unexpected render throws hit Next's default error UI — P2 item in `docs/RELEASE_READINESS.md`).

## 4. Backend and API architecture

**[Verified in source code]**

- **Surface:** ~90 route handlers under `src/app/api/v1/**` (auth, listings, viewings, deals, payments, landlord, admin, ops, media, activity, identity, commission-rate). Full inventory in `docs/DEVELOPER_ONBOARDING.md` §7 and the code itself; guards via `src/server/http.ts` (`requireSession`, `requireRole`, `route()` error wrapper, `parseShillings` integer money).
- **Error model:** one `ApiError(status, code)` class + a name-map (`http.ts:40-97`) turning domain errors (`DealAlreadyExistsError` → 409, `NotYourListingError` → 403, `SnapshotImmutableError` → 409, …) into typed HTTP responses; unmapped errors → 500 `INTERNAL` carrying only the class name (no message leak; there is no operator log access on Vercel).
- **Validation:** hand-rolled per-route (no zod — installed but unused). Money **never** crosses as float: `parseShillings` regex-validates integer strings; wire format is strings; client parses to `bigint` (`src/lib/money.ts`, deliberately no `toNumber`).
- **Authorization:** roles `tenant | lister | foo | admin` (`src/server/domain.ts:22`); enforced at the HTTP edge, re-checked inside every service (ownership errors are 404-shaped where existence should be hidden — "404-not-403"), re-checked in the in-process adapter, and re-checked per deal action against the `DEAL_ACTIONS` catalogue (`domain.ts:315+`, `src/app/api/v1/deals/[id]/[action]/route.ts:241-252`). No `middleware.ts`; no CSRF tokens (relies on SameSite=Lax + JSON POSTs + no cookie-driven state change).
- **Rate limiting:** two layers in `src/server/rate-limit.ts` — per-instance in-memory sliding window + **durable** fixed window in the shared `rate_limit_counter` table (one atomic upsert per hit). The durable layer **fails open** until DRAFT migration `20261101120000` is applied (P2021 path, once-per-minute warn). Upload endpoints use memory-only windows sized to resource protection.
- **Audit & activity:** append-only `audit_event` rows written **in the same transaction** as critical actions; admin-only reads. `src/server/activity.ts` is a small read-only projection (latest events) for tenant/landlord feeds. No email/notification channel exists.
- **Sessions:** custom (next-auth installed but unused). Opaque 32-byte token in an `httpOnly SameSite=Lax` cookie (`hfr_session`, 30-day); only the SHA-256 hash is stored (`session.refresh_token_hash`); sliding **1-hour idle expiry** capped at 30 days absolute (`src/server/auth.ts:46-50`); bcrypt cost 10 with dummy-hash timing equalization; password change re-verifies the current password and revokes other sessions; staff accounts are admin-provisioned with one-time credentials.

## 5. Data layer

**[Verified in source code]** (schema); production facts **[Verified in production]**

- **Prisma schema** (`prisma/schema.prisma`, 45 models / 42 enums): hub-and-spoke around `Party` (every human/actor); `UserAccount` (role) + `UserCredential` (bcrypt hash, isolated) + `Session`; financial spine `Deal` (19 statuses) with **snapshot columns** frozen at signing (`monthlyRentSnapshot`, `commissionRateBpSnapshot`, `advanceRentSnapshot`, `depositAmountSnapshot`, `commissionPayerSnapshot`, `policySnapshot`, …); append-only `DealTransition` history; **double-entry ledger** (`LedgerAccount` typed by `LedgerAccountType` — `rent_escrow_liability`, `deposit_liability`, `commission_revenue`, `landlord_payable`, `psp_clearing`, `psp_fee_expense`, legacy `escrow_liability`, reserved `commission_receivable`; `LedgerEntry` postingId/direction/BigInt amount); **PSP boundary** (`PspInstruction` with `idempotencyKey @unique` + append-only `PspInstructionEvent` deduped per `(instructionId, toState)` — current state is derived, never the stored initial state); `RefundRecord` (kinds/states), `FinancialAdjustment`, `PostSettlementRefund` (landlord-side, never a platform liability), `DepositCase`/`DepositDeduction`, `MoveInVerification`, `CommissionRateVersion` (basis points of one month's rent), `ListingAgreement`; viewing domain (`Viewing`, immutable `IntroductionRecord`, `FieldReport`); `LandlordKyc` (three section states) + `ConsentRecord` (append-only) + `IdentityVerification`; media (`MediaAsset`/`MediaVariant`/`ListingPhoto` with provenance); `PropertyMandate`; `Property`/`Listing`/`Neighbourhood`/`Amenity`; `SavedListing`; `ScreeningRun`; `ConfigParameter`/`ConfigVersion` (append-only versions); `AuditEvent`; `RateLimitCounter`.
- **Money:** all amounts BigInt integer UGX shillings; commission = `monthly_rent × rate_bp / 10000` integer math. **Known export bound:** JSON-number corruption for values ≥ 2^53 on the backup path (safe at current magnitudes; documented `docs/DISASTER_RECOVERY.md`).
- **Production (Supabase Free):** PostgreSQL 17.6, 21 MB, 49 public tables incl. out-of-band `ba_user/ba_session/ba_account/ba_verification` (better-auth pass applied outside the ledger) and `_applied_migrations` (manual ledger); `_prisma_migrations` has 14 rows incl. **two failed `better_auth` rows** (later recorded as rolled-back/benign in `docs/FEATURE_VERIFICATION_MATRIX.md` §8.6 — the older "blocks deploy" warning in `scripts/apply-migration.mjs` header predates that finding; settle with one read-only ledger query before relying on either). RLS auto-enable event trigger on new public tables. `src/lib/db.ts` hardens pooler URLs (port 6543 transaction mode, `pgbouncer=true`, `connection_limit=4`, `sslmode=require`).
- **DB-level immutability wall (not in Prisma):** 10 `<table>_immutable` triggers (`audit_event`, `commission_rate_version`, `config_version`, `consent_record`, `deal_transition`, `introduction_record`, `ledger_entry`, `listing_agreement`, `psp_instruction`, `psp_instruction_event`) executing `reject_mutation()`, plus `viewing_conducted_requires_evidence` — captured read-only from production and committed as `scripts/recovery-triggers.sql` (apply **after** data load on recovery targets). **[Verified in production]**
- **Migration status (2026-11-11):** applied — `media_variants` (2026-10-27), `financial_architecture_foundation` (2026-10-30), `financial_operations_phase2` (2026-10-31 — presence of `provider_statement(_line)` in the Round-69 production census settles the older "DRAFT" claims in `docs/FINANCIAL_ARCHITECTURE.md` §10; those lines are **stale**), better_auth (out-of-band, ledger debris). **Unapplied DRAFTs:** `20261028120000_deal_active_per_introduction` (partial unique index; predicate excludes exactly `closed/cancelled/refunded/reversed` — verified verbatim this audit), `20261029120000_landlord_kyc` (table absent from production — verified), `20261101120000_rate_limit_counters` (table absent — verified).
- **Local dev:** PGlite stack (`scripts/dev-local-stack.mjs`, port 54321, seeds 5 Kampala neighbourhoods) or disposable full-stack rigs; DDL regenerated from the datamodel via `prisma migrate diff` — developers never `db push` against production (guarded by `scripts/db-push-guard.mjs` + `scripts/production-guard.mjs`).

## 6. Financial core (summary — full design record in `docs/FINANCIAL_ARCHITECTURE.md`)

**[Verified in source code]**

- **Deal state machine** (`src/server/domain.ts:144-202`): 19 statuses; guards per transition in `src/server/deals.ts`; terminal = closed/cancelled/refunded/reversed; funded deals can only end move-in-confirmed or refunded.
- **Ledger** (`src/server/ledger.ts`): single-writer `post()` validates ≥2 legs, amounts > 0, Σdebits = Σcredits **before** any write; per-deal accounts lazily created inside the caller's transaction; balances always derived, never stored; corrections are new reversing postings; entries reference originating PSP instruction ids (`fund_escrow:{instructionId}`).
- **Atomicity & concurrency:** every money transition runs status + immutable transition row + ledger posting + audit in ONE interactive transaction (30 s budget) with a CAS re-check of the prior status (`applyTransition`, `deals.ts:1415-1486`); PSP network calls happen **before** the transaction opens (no network under DB locks).
- **Commission:** earned exactly once inside the custody-booking transaction (`applyEscrowFunding`), reachable only via mock-instant or signature-verified, exact-amount, webhook-confirmed payment; base = `monthlyRentSnapshot` only (deposit structurally outside); reversal category-gated.
- **Deposits:** separate `deposit_liability` custody + case lifecycle; deduction application re-checks the balance inside the posting transaction; release has a single-pending guard; case closes only at zero balance.
- **Webhook security:** HMAC over the raw body (`x-nylon-signature`) + 5-minute freshness via the SDK; unconfigured secret → 503 fail-closed; invalid → 401; unknown-but-signed → 200 ACK; amount/currency guard refuses mismatched bookings; forward-only instruction state transitions make at-least-once delivery idempotent.
- **Honesty markers:** sandbox instructions are self-labeled MOCK in the database; live release/refund instructions park `pending` ("Awaiting payout dispatch"); duplicate-payment refunds never book ledger rows (they return never-booked money); provider statements are manual imports with frozen per-line verdicts and two never-merged balances.

## 7. Media pipeline

**[Verified in source code]** (`src/server/media.ts`, `media-storage.ts`, `image-pipeline.ts`, `src/app/api/v1/media/[id]/route.ts`)

Storage seam with Supabase Storage (private bucket `media`, service-role REST) and local-disk adapters; production **refuses local uploads**. Upload path: magic-byte sniffing (JPEG/PNG/WebP) → 4 MB cap → pixel-bomb guard (≤8000 px/side, ≤50 MP) → sharp renditions (thumb 360 / card 760 / detail 1520, EXIF/GPS-free WebP) → rows + bytes committed in one transaction with compensation on failure. Serving: public **only** while the asset decorates a live listing, else 404-shaped authorized access; `public, immutable` caching only for public assets; staff deletion refuses while any live listing references the asset. Orphan sweep script with two-key deletion convention.

## 8. External providers and integrations

| Integration | Status | Evidence |
|---|---|---|
| NylonPay (collect) | SDK integrated; live mode requires all 3 credentials else falls back to the labeled sandbox mock; **live webhook signature gate verified against production** (unsigned 401 / bogus 401); full live E2E not yet executed | `src/server/nylonpay.ts`, `docs/NYLONPAY_GOLIVE.md` |
| NylonPay (payouts) | **Not wired** — instructions park pending | `src/server/ledger.ts` |
| Supabase Storage | Private `media` bucket (5 MiB, jpeg/png/webp) | `src/server/media-storage.ts` |
| Identity/KYC provider | **Mock** (disclosed everywhere it appears) | `src/server/ops.ts` |
| Email/notifications | **None** (no channel implemented) | `docs/FEATURE_VERIFICATION_MATRIX.md` §2.4 |
| GitHub | Source host (`naturalintellectscrop-ctrl/HouseForRent`); PAT-based pushes | git remote **[Verified in source — remote name only]** |

## 9. Deployment and environment

**[Verified in source code]** + **[Verified in production]** (live 200 this audit; Vercel "Deployment has completed" recorded on `c0ed8e9` in commit `ad93c96`'s message)

- **Deploy:** push to `main` → Vercel (framework preset; `vercel.json` is minimal). Build: `next build` + standalone assembly (`cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/`); `apps/web` is a no-code workspace shim satisfying a stale Vercel Build Command override (`npm run build --workspace @hfr/web`). Headers/CSP live in `next.config.ts` so dev/standalone/Vercel serve identical policy (global CSP, `X-Frame-Options: DENY`, nosniff, `Permissions-Policy`, `Cache-Control: private, no-store` on portal/ops/platform paths).
- **Environment variables (names only — values never in repo):**
  - Runtime: `DATABASE_URL`, `NODE_ENV`, `NEXT_PUBLIC_SITE_URL` (falls back to the production URL), `DEBUG_QUERIES`, `NYLONPAY_API_KEY`, `NYLONPAY_API_SECRET`, `NYLONPAY_WEBHOOK_SECRET`, `NYLONPAY_MODE`, `NYLONPAY_BASE_URL`, `MEDIA_STORAGE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_MEDIA_BUCKET`, `MEDIA_ROOT`, `MEDIA_MAX_BYTES`.
  - Ops scripts (self-guarding): `PROD_DATABASE_URL`; `TARGET_DATABASE_URL` + `ALLOW_PROD_MIGRATION`; `RESTORE_DATABASE_URL` + `ALLOW_DB_RESTORE`; `PROVISION_DATABASE_URL`; `OWNER_*` provisioning vars; `QA_PASSWORD`/`RIG_*`/`DEMO_PASSWORD`/`SEED_PASSWORD` etc.; `SWEEP_DRY_RUN`/`ALLOW_ORPHAN_DELETE`; `DRY_RUN`/`APPLY` (media repair).
  - Files: `.env` and `.env.prod` exist untracked (each holds `DATABASE_URL`; the sandbox `.env` carries a stale SQLite `file:` template — a documented trap, DR §2a). **No `.env.example`** (P2).
- **Verification:** no health endpoint exists; deployment verification = Vercel GitHub commit status + manual smoke (and this audit's live 200). Production DB verification = read-only probes (`scripts/verify-prod-db.mjs`, `verify-prod-finance-state.mjs`, `prod-gate-db-probe.mjs`).
- **Monitoring/logging:** none beyond Vercel build logs and `console.error` (documented rationale: no operator log access on Vercel drives the typed-error design). No CI (`.github` absent): gates are manual per-round `tsc --noEmit` + ESLint + the five suites, recorded in `worklog.md`/`docs/REVIEW_LOG.md`.

## 10. Repository map (what lives where)

| Path | Contents |
|---|---|
| `src/app/(site)` | Public marketplace + company pages |
| `src/app/(portal)/account` | Tenant portal; `(portal)/landlord` | Landlord portal |
| `src/app/ops` | Staff console (FOO field-work + admin sections) |
| `src/app/platform` | Owner control center (admin) |
| `src/app/api/v1/**` | ~90 HTTP route handlers |
| `src/server/**` | Domain services (the real system) |
| `src/lib/**` | `db.ts` (Prisma client + pooler hardening), `api.ts` (in-process read adapter), `client.ts` (HTTP client), `session.ts`, `money.ts`, `contract.ts`, `portal.ts`, `seo.tsx` |
| `src/components/ui/**` | Unused shadcn scaffold (see hygiene audit) |
| `prisma/` | `schema.prisma` + 6 migration dirs (3 DRAFT) |
| `scripts/` | 40+ operational scripts: 5 test suites, DB export/restore/drills, migration rails, read-only prod probes, media tools, seeds/purge, QA walkers |
| `docs/` | 11 existing docs + the 5 onboarding/audit deliverables |
| `backups/` (gitignored) | The 2026-11-11 verified production export + sidecar + preflight artifact |
| `.zscripts/` | **Git-tracked** legacy sandbox deploy scripts (hygiene audit — removal candidate) |
| `tests/`, `examples/`, `mini-services/`, `Caddyfile` | Sandbox-scaffold artifacts (hygiene audit) |
| `worklog.md` | The continuity record (69 rounds) — read it before changing anything historical |

## 11. Architecture boundaries — do not change casually

1. **Append-only tables** (10 DB-enforced, plus `consent_record`): corrections are new rows / reversing postings — UPDATE/DELETE raises at the DB level, even for superusers. **[Verified in production]**
2. **Deal snapshot columns** — funded deals must derive every figure from snapshots, never live listing pricing (the re-pricing-window defect this design closed).
3. **`PspInstruction.state`** is the *initial* state only; current state = latest `PspInstructionEvent.toState`. Reading it directly double-books money.
4. **`ALTER TYPE … ADD VALUE`** (8 deal statuses, 3 account types) is practically irreversible — enum values cannot be dropped in place.
5. **`deal_one_active_per_introduction`** partial index is not expressible in the Prisma datamodel — any future `db push` would try to drop it; migrations only, never push.
6. **The commission-rate version table** is the only place the rate changes; signed deals are immune by snapshot (intentional).
7. **`src/lib/money.ts` discipline** — BigInt everywhere; the two known `Number()` display exceptions are logged in `docs/RELEASE_READINESS.md` P2-5.
8. **The in-process adapter must never gain mutations** — the HTTP route handlers + their guards are the only mutation path.
