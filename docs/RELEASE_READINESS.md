# House For Rent — Release Readiness

**Status:** Written 2026-11-11 from a read-only audit at commit `ad93c96`. Production facts are from the 2026-11-11 read-only preflight artifact (`backups/prod-preflight-20261111T053456.json`), the Round-69 worklog record, and a live HTTP check performed during this audit. Labels: **[Verified in source code]**, **[Verified by automated test]** (recorded suite runs; not re-executed in this audit), **[Verified in production]**, **[Reported by previous agent]**, **[Inferred or unverified]**.

Status vocabulary (inherited from `docs/FEATURE_VERIFICATION_MATRIX.md`): **VERIFIED / UNVERIFIED / BLOCKED / MOCK / NOT IMPLEMENTED**. "An HTTP 200 is not proof of a journey."

---

## 1. Current production snapshot (2026-11-11)

- **Deployed code:** `e1a4acf..c0ed8e9` pushed and Vercel-verified ("Deployment has completed"), live 200 recorded Round 69 **[Reported by previous agent — commit `ad93c96` message]**. `ad93c96` (current HEAD, pushed) adds only docs + `scripts/recovery-triggers.sql` — deployed app code equals HEAD code. **Live liveness re-verified this audit:** `https://houseforrentug.vercel.app` → HTTP/2 200 with the documented CSP headers. **[Verified in production]**
- **Database:** PostgreSQL 17.6, db `postgres`, 21 MB, 49 public tables **[Verified in production]**. Rows: 8 party / 8 user_account / 8 user_credential / 40 session / 3 property / 3 listing / 5 listing_agreement / 12 neighbourhood / 58 audit_event / 5 config_parameter / 1 commission_rate_version / 6 consent_record / 3 lister_profile / 4 listing_photo / 4 media_asset / 12 media_variant / 2 identity_verification / 1 saved_listing / 1 viewing. **All money tables 0 rows (deal, ledger_entry, psp_instruction, refund_record) — no real money has moved.**
- **Migration ledger:** `_prisma_migrations` 14 rows, including two failed `better_auth` rows. Presence checks in the preflight artifact settle two prior ambiguities:
  - `provider_statement` + `provider_statement_line` **present** → `20261031120000_financial_operations_phase2` **IS APPLIED**. The "DRAFT — committed UNAPPLIED" lines in `docs/FINANCIAL_ARCHITECTURE.md` §10 and `docs/REVIEW_LOG.md` are **stale** — this document supersedes them.
  - `landlord_kyc` **absent** and `rate_limit_counter` **absent** → `20261029120000_landlord_kyc` and `20261101120000_rate_limit_counters` remain **DRAFT/unapplied**, as do `20261028120000_deal_active_per_introduction` (index) — three DRAFTs total.
  - `better_auth` failed rows: `docs/FEATURE_VERIFICATION_MATRIX.md` §8.6 records them as rolled-back/benign (both `rolled_back_at` set, applied_steps 0; same migration applied successfully 18 s later — "they do NOT block `migrate deploy`"), while the older `scripts/apply-migration.mjs` header still warns they block. **Unresolved documentation conflict — settle with one read-only ledger query before planning `migrate deploy`.** **[Reported by previous agent / Inferred]**
- **DB-level wall:** 10 `<table>_immutable` append-only triggers + `reject_mutation()` + `viewing_conducted_requires_evidence` captured read-only and committed (`scripts/recovery-triggers.sql`). RLS auto-enable on new public tables. **[Verified in production]**
- **Backup:** first **verified** production export `export-2026-11-11T05-35-57-612Z.ndjson.gz` (184 rows / 19 non-empty tables; sha256 `6fc9b2a6…e09a` sidecar MATCH via `gunzip -c | sha256sum`; same-day `production-recovery-drill.mjs` ALL CHECKS PASSED). **Off-host independent copy: PENDING OWNER ACTION** — until recorded, the backup is "verified-but-not-yet-independent" and the sandbox is ephemeral (the 2026-10-23 export was lost exactly this way). **[Reported by previous agent — artifacts present this audit]**

## 2. Verified capabilities (what genuinely works)

| Capability | Status | Evidence |
|---|---|---|
| Registration, login, sessions, 1-h idle logout, password change w/ session revocation | VERIFIED | `src/server/auth.ts` [Verified in source code]; journeys browser-verified rounds 59–61 [Reported by previous agent] |
| Role enforcement incl. officer read-path hardening (P-1), markNoShow discipline (B-3), dry-run ownership (B-4) | VERIFIED | `scripts/authz-regression-tests.mjs` 67/67 [Verified by automated test] |
| Landlord KYC pipeline (terms, evidence privacy, three-section review) | VERIFIED | `scripts/kyc-pipeline-tests.mjs` 80/80 [Verified by automated test] |
| Listing lifecycle: create → verify → publish gates → live → rented/withdrawn; dry-run publish | VERIFIED | `src/server/listings.ts` + suites [Verified in source code / automated test] |
| Officer field verification, media capture, immutable introductions, deal creation from introductions | VERIFIED | `src/server/viewings.ts`, `deals.ts`; deal-uniqueness suite 18/18 incl. 6-way race [Verified by automated test] |
| Deal state machine + snapshot-frozen agreements + double-entry ledger + refunds/reversals/deposits/move-in | VERIFIED (code) | `scripts/finance-pipeline-tests.mjs` 166/166 incl. signed-webhook rehearsals [Verified by automated test] |
| Image pipeline (magic bytes, pixel-bomb guard, EXIF-free variants, transactional rows+bytes, orphan sweep) | VERIFIED | `scripts/image-pipeline-tests.mjs` 38/38; `docs/IMAGE_PIPELINE_REPORT.md` [Verified by automated test] |
| Durable rate limiting | **FAIL-OPEN in production until migration applied** | `src/server/rate-limit.ts` (P2021 path) [Verified in source code]; absence of `rate_limit_counter` in prod [Verified in production] |
| NylonPay webhook security gate (live signature verification) | VERIFIED against production endpoint (unsigned→401, bogus→401) | `docs/NYLONPAY_GOLIVE.md`, worklog Round 57+ [Reported by previous agent] |
| Backup & recovery machinery on real export | VERIFIED (same-day drill ALL CHECKS PASSED) | `docs/DISASTER_RECOVERY.md` §2a artifact table [Verified in production — reported] |

## 3. Known limitations that are deliberate and disclosed

Mock identity provider (`IDENTITY_PROVIDER_IS_MOCK`); sandbox PSP self-labeled MOCK in the DB; payouts parked `pending`; deposit custody flag off; provider statements manual-import; no email channel; move-in/deposit deadlines unset (registered in `PENDING_POLICY_APPROVALS` — 7 items); "dispute_hold → settled" commission-free path recorded as a deliberate policy lever (F-7); commission reversals restricted to two approved categories.

## 4. Financial readiness (approved rules → implementation state)

| Rule | Implementation | Gap |
|---|---|---|
| 10% commission, landlord-paid, once, initial rent via HFR | `computeCommission` (snapshot, integer bp), payer frozen at signing, earned once in confirmed-payment tx | **Rate value conflict — see P0-2** (default 10000 bp = one month, not 10%) |
| Deposits excluded from commission | Base = `monthlyRentSnapshot` only; deposit in its own `deposit_liability` account | None known |
| PSP fees = HFR operating expense | `psp_fee_expense` postings; "never touches the tenant's deposit" | Fee *recording* requires a verified provider source ref — manual today |
| Commission only after provider-confirmed payment | Booking only from signed, exact-amount webhook | Full live E2E with the real provider not yet executed |
| Payout after verified move-in + checks | `move_in_confirmed` is the only settlement gateway; admin decision authority | **Payout dispatch NOT implemented** (instructions park pending) — blocked on NylonPay payout API |
| Deposits separate from rental income | Split custody from the funding posting | **Live deposit custody gated off** (`deposit_custody_provider_confirmed = false`) pending provider-custody verification + legal |
| Renewal → no commission | No renewal path exists | None |
| Prepaid rent/refunds per agreed arrangements | Ledger-bounded refunds; post-settlement = landlord-side coordination record | Counsel review of the arrangements outstanding |
| Duplicate payment handling | Bounded, source-linked, provider-confirmed resolution; no ledger booking | Operational process only — fine |
| Reconciliation | Internal engine automated + persisted; provider side manual import with frozen verdicts | No provider API fetch (manual for now) |

**Verdict: the system is NOT ready to handle real money end-to-end.** Money-in is code-complete (collect) with the webhook gate proven, but the full live loop has not been executed with the provider; money-out (payouts) is not integrated; deposit custody of real funds is intentionally locked; and the legal/custody questions (B3–B8 in `docs/LEGAL_QUESTIONS_REVIEW.md`) are hard blocks.

## 5. Security readiness

**Strong (evidence):** server-side role enforcement in depth (P-1 suite); 404-not-403 existence hiding; bcrypt cost 10 + timing equalization; hash-only session tokens with idle expiry; password change revokes other sessions; rate limiting on credential endpoints (two layers); webhook fail-closed signature gate; upload magic-byte/pixel-bomb/size guards; EXIF-free renditions, private originals; media public-only-on-live-listing; append-only audit in-transaction; DB-level immutability wall; CSP/X-Frame-Options/nosniff/Permissions-Policy headers from one source; two-key production rails; secrets never committed (`.env*` ignored; git history checked — only SQLite-era `file:` URLs ever tracked).

**Gaps/risks (all [Verified in source code]):** `session.refresh_token_hash` has no unique constraint or index (lookup scans); `clientIp()` trusts `X-Forwarded-For` verbatim (fine behind Vercel, spoofable if self-hosted); no CSRF tokens (SameSite=Lax + JSON-POST mitigations; logout is a plain form POST by design); no account-level login lockout across IPs; a few bad-input paths throw bare `Error` → opaque 500 (e.g. `landlord/properties` bedroom ranges, `ops/config` rate range, field-report `conditionRating`); durable rate limiting inactive in production until its DRAFT migration lands; **no CI**; **no error.tsx boundaries**; **credentials rotation still recommended** (Round-69 chat exposure). Service-role key rotation was recommended after a Round-58 exposure **[Reported by previous agent]** — confirm done.

## 6. Prioritized outstanding work

### P0 — Critical security, data-integrity or release blockers

| # | Item | Evidence | Files | Risk if ignored | Acceptance |
|---|---|---|---|---|---|
| P0-1 | **Copy the verified backup off-host and record the second digest** (DR §2a Steps 5–6) | `docs/DISASTER_RECOVERY.md` §2a; artifacts in `backups/` | `backups/export-2026-11-11T05-35-57-612Z.ndjson.gz` + `.sha256` | Sandbox is ephemeral — a sandbox loss destroys the ONLY backup (precedent: 2026-10-23) | Copy stored off-host; `gunzip -c <copy> \| sha256sum` matches `6fc9b2a6…e09a`; artifact table updated |
| P0-2 | **Resolve the commission-rate decision (10% vs 10000 bp default)** before any real deal signs | `src/server/listings.ts:457-459` [Verified in source code]; production has 1 rate-version row [Verified in production]; approved rule says 10% | `ops/config` endpoint (create a new version) or policy docs | Signed deals snapshot the in-force rate — a wrong rate is effectively irreversible per deal | Owner decision recorded; a version row at the approved bp exists **before** first signed deal; `/for-landlords` copy matches |
| P0-3 | **Rotate credentials exposed in chat (Round 69): Supabase DB password, GitHub PAT; confirm service-key rotation from Round 58** | worklog Round 69 [Reported by previous agent] | Supabase dashboard / GitHub settings | Chat-transited secrets are compromised-by-policy | New credentials never transit chat; old revoked |
| P0-4 | **Apply the three DRAFT migrations through the §2a rails, individually, after the backup loop** (deal-uniqueness index → landlord_kyc → rate_limit_counters) | Migration files + DR §2a; Round 69 kept them unapplied by design | `prisma/migrations/20261028…`, `20261029…`, `20261101…`; `scripts/apply-migration.mjs` | Deal uniqueness remains check-then-insert only (race window); durable rate limiting stays fail-open; KYC surfaces stay degraded | Each: fresh export → apply via rails → read-only verify → drill; ledger row verified |

### P1 — Required for reliable production launch

| # | Item | Evidence | Notes |
|---|---|---|---|
| P1-1 | **Settle the `better_auth` ledger ambiguity** (one read-only `_prisma_migrations` query: `rolled_back_at` set?) before relying on `prisma migrate deploy` | Conflicting docs: matrix §8.6 vs `apply-migration.mjs` header | [Inferred — needs the query] |
| P1-2 | **Fix `db-restore.buildInsert` for non-null `text[]`** (`field_report.media_asset_ids`) before field officers file reports with media refs | DR §2a bound #3 (42804) | Hard restore blocker the moment such rows exist; zero today [Verified in production] |
| P1-3 | **NylonPay go-live ladder**: merchant KYC → live keys → sandbox-keys prod smoke → first real transaction; execute the full live webhook E2E | `docs/NYLONPAY_GOLIVE.md` | Also note Level-1 10M UGX/month cap |
| P1-4 | **Identity provider replacement** (mock is a trust blocker) | `IDENTITY_PROVIDER_IS_MOCK`; matrix blocker #2 | Product/provider decision |
| P1-5 | **Legal counsel review** of terms/privacy + the 12 questions; resolve B3–B8 before real money | `docs/LEGAL_QUESTIONS_REVIEW.md` | Hard launch block |
| P1-6 | **Deposit custody go/no-go**: provider custody verification + legal approval, then flip `deposit_custody_provider_confirmed` | `policy.ts`; G-4/FINANCIAL_ARCHITECTURE | Business/legal decision |
| P1-7 | **Minimal CI** (tsc + lint + five suites on PR/push) — nothing automated exists today | `.github` absent [Verified in source] | Prevents unverified pushes |
| P1-8 | **Domain/DNS** (`houseforrent.ug`) + set `NEXT_PUBLIC_SITE_URL` explicitly; update webhook URL | `NYLONPAY_GOLIVE.md`; `seo.tsx` fallback | Product decision |
| P1-9 | **Add DB indexes for hot paths** in a reviewed additive migration: `deal(listing_id,status,tenant,landlord)`, `deal_transition(deal_id)`, `ledger_entry(deal_id,occurred_at)`, `psp_instruction(deal_id)`, `audit_event(event_type,occurred_at)`, `session(expires_at)`, `listing(property_id,publication_state)` | Schema review this audit [Verified in source] | Fine at current volumes; before growth |
| P1-10 | **Session hardening**: unique index on `session.refresh_token_hash` (+ ordinary index) | `schema.prisma:238-250`; `auth.ts:95-98` | Small additive migration |

### P2 — Important functionality / operational improvements

P2-1 **Route-level `error.tsx` boundaries** (portal/ops/platform) — unexpected render errors currently hit Next defaults. P2-2 **Fix bare-`Error` 500s** → 400/422 (`landlord/properties` ranges, `ops/config` rate range, field-report `conditionRating`, `setListerTier` inputs). P2-3 **`.env.example` + README** (onboarding currently lives only in docs/worklog). P2-4 **`landlordFinancials` "held" figure under-counts split-custody deals** (sums only legacy `escrow_liability` — `deals.ts:1152`). P2-5 **Align the two `Number()` money display sites** with the BigInt formatter (`(site)/properties/page.tsx:124`, `(portal)/landlord/page.tsx:57`). P2-6 **Consolidate the three blocker-label maps** into `lib/portal.ts`. P2-7 **Hygiene cleanup set** per `docs/REPOSITORY_HYGIENE_AUDIT.md` (remove `z-ai-web-dev-sdk` dep, `examples/websocket`, `.zscripts`+`tests/*.sh` as a set after the Vercel override is cleared, `.env` chmod 600, gitignore tightening, clear the Vercel Build Command override then delete `apps/web`, single lockfile). P2-8 **Reconcile stale doc lines** (FINANCIAL_ARCHITECTURE §10 "DRAFT" for Phase-2; apply-migration header better_auth warning; stale `verify-restored.mjs`/`seed-demo.mjs`/`qa-journey.mjs` disposition; `robots.ts` vs `/platform` noindex; dead `?reason=staff-only`). P2-9 **Media byte backup strategy** (photos are outside every DB backup — DR §5). P2-10 **Monitoring**: at least a health endpoint + error capture (none today).

### P3 — Future enhancements

Renewal/recurring-rent journeys; tenant screening expansion (`ScreeningRun` framework exists); notification channels (email/SMS/WhatsApp — WhatsApp links already appear in UI); provider statement auto-fetch; multi-city service areas; analytics on the platform center; partial-payment scheduling; self-serve landlord payouts dashboards.

## 7. Technical blockers vs product/legal/provider/business decisions

- **Engineering-owned (can start once authorized):** P0-1, P0-4, P1-1, P1-2, P1-7, P1-9, P1-10, all P2 items.
- **Owner/business decisions:** P0-2 (rate), P0-3 (rotation), P1-3 (PSP go-live), P1-4 (identity provider), P1-6 (custody), P1-8 (domain).
- **External/legal:** P1-5 (counsel); the 7 registered `PENDING_POLICY_APPROVALS` items (move-in window, deposit deadlines, cancellation/retention rules, dispute SLA, custody verification, payment-structure legality).

## 8. Bottom line

The platform is **functionally complete for its managed-marketplace scope and unusually honest about its edges**, with every money table still at zero rows and every risky path explicitly gated. The shortest honest path to "launch-ready with real users": P0-1 → P0-2 → P0-4 → P1-3/P1-4/P1-5/P1-6 in parallel → P1-7/P1-8. Nothing in the codebase blocks those except the items listed; nothing should be improvised around them.
