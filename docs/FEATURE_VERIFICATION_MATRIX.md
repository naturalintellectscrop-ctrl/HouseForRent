# Feature & User-Journey Verification Matrix

Launch readiness is stated per feature, per the evidence standard: a build,
a route's existence, an HTTP 200 or a mocked test is NOT proof of a journey.
Every status below names its evidence. Re-verified after the 2026-10-23
Supabase resumption; commit lineage e501b97 → 1c9db37 → 75c8c73 → 5649f9a →
c65344e → f48c4b7 → fd1b032 → ca5010b → 28b808d (dual-pushed main +
sandbox/webapp; Vercel deploys from the tracked branch).

Statuses: VERIFIED (end-to-end on the named surface) · FAILED (reproducible
defect, linked in defect log) · BLOCKED (external dependency, named) ·
UNVERIFIED (implemented, not yet exercised end-to-end on current prod) ·
NOT IMPLEMENTED (by decision or omission — stated, not pretended).

Evidence keys: P = production HTTP/browser · D = dev/browser · S = script
(qa-journey / E2E round) · R = repository code audit (read, not claimed as a
journey) · DB = direct read-only database evidence.

## 1. Public site & discovery

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 1.1 | Home page renders, honest empty state | VERIFIED | P (200, honest copy, screenshots Task 44) |
| 1.2 | /properties listing discovery (degraded-mode copy when DB unreachable) | VERIFIED | P (200; degraded path exercised during the paused-DB round) |
| 1.3 | /properties/[id] detail page | VERIFIED | S+P (pre-pause rounds; unchanged code; re-render check this round) |
| 1.4 | Search/filter/pagination | UNVERIFIED (current prod) | R (code present); zero live listings so search results empty; re-verify once photography pipeline repopulates listings |
| 1.5 | /how-it-works, /terms, /privacy, sitemap | VERIFIED | P (Task 44 round 2, two viewports) |
| 1.6 | Security headers (CSP, HSTS, XFO, nosniff, Referrer, Permissions) | VERIFIED | P (curl -I Task 43; re-check this round) |

## 2. Authentication, sessions, roles

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 2.1 | Registration (phone+password, no email, tenant/lister roles only) | VERIFIED | S+P (Task 44: QA E2E accounts created on prod) |
| 2.2 | Login / session cookie / logout | VERIFIED | S+P (Task 44) |
| 2.3 | Role-based authorization matrix (tenant/lister/foo/admin) | VERIFIED | S+P (Task 44 round 2: upload 403, metadata 403/404, delete 404, cross-account refusals) |
| 2.4 | Password reset (self-service) | NOT IMPLEMENTED | R (no email channel; reset tokens table exists; operator-assisted path documented) |
| 2.5 | Account status policy at login (pending_verification/disabled/archived) | VERIFIED | R+P (AccountStatusPolicy enforced at login; qa contract tests) |
| 2.6 | Identity verification | NOT IMPLEMENTED (disclosed mock) | R+P (provider is a sandbox mock, stated on every surface; real provider is an external blocker) |

## 3. Landlord/homeowner onboarding & listings

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 3.1 | Landlord creates property → listing (awaiting_verification) | VERIFIED | S+P (Task 44) |
| 3.2 | Listing edit (own, pre-publication) | VERIFIED (local browser) / UNVERIFIED (current prod) | D (2026-10-27: the edit capability did NOT exist — old VERIFIED claim was stale. New POST /amend + AmendPanel: terms-only keeps verdict, physical change re-opens verification, 409 live, 403 cross-account — all browser/API-verified on the local stack) |
| 3.3 | Publish dry-run blocker list (field_verification, listing_agreement, photography) | VERIFIED | S+P (Task 44: photography gate armed/disarmed on add/delete) |
| 3.4 | Publish-to-live | VERIFIED (local full ladder) / UNVERIFIED (current prod) | D (2026-10-27 local stack: officer verify-listing → publish enables → LIVE → public card+detail; bucket `media` exists on prod; migration applied + ledger OK, RLS parity checked) |
| 3.5 | Unpublish/withdraw | VERIFIED (local browser) / UNVERIFIED (current prod) | D (2026-10-27: withdraw from search → state Withdrawn, photo upload re-enables, amend unlocks; republish works) |
| 3.6 | Agreement acceptance (append-only wall) | VERIFIED | P (Task 44 defect #2 fix verified live) |
| 3.7 | Landlord photo upload/replace/delete (own listing, pre-publication) | VERIFIED (local, end-to-end browser) / UNVERIFIED (current prod) | D+S (2026-10-27 local: 3 uploads render as variants; delete removes 4 objects + rows; replace via withdraw→add; live-state upload honestly disabled; 415/413 visible errors; Task 44 prod auth matrix unchanged) |

## 4. Photography & media pipeline

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 4.1 | Magic-byte content validation (JPEG/PNG), declared-MIME cross-check | VERIFIED | S+P (Task 44: spoof 415) |
| 4.2 | Size cap (4 MB) & count cap (12) | VERIFIED | S+P (Task 44) |
| 4.3 | Transactional rows+bytes with compensation | VERIFIED | R (code contract) + P (upload failures compensated; Task 44 honest-error flow) |
| 4.4 | Visibility: public ⇔ decorates LIVE listing; else uploader/staff/owner | VERIFIED | S+P (Task 44 authorization matrix) |
| 4.5 | EXIF orientation fix + metadata/GPS stripping | VERIFIED (rig, end-to-end) | S (2026-10-27: served thumb re-decoded → no EXIF; original keeps EXIF privately; portrait right-top bakes to 1013×1520) |
| 4.6 | Optimized variants (thumbnail/card/detail, WebP) + DB metadata | VERIFIED (rig + local browser) | S+D (2026-10-27: 38/38 rig checks; browser renders card on search, detail+thumb on public detail; DB rows == stored objects 12/12) |
| 4.7 | Pixel-count / dimension bomb guard | VERIFIED (rig) | S (2026-10-27: 81 MP bomb → 413 MEDIA_DIMENSIONS; decoder-derived limits 8000 px / 50 MP) |
| 4.8 | Upload request-rate limiting | VERIFIED (rig) | S (2026-10-27: 429 trips inside the window; rate-limit.ts shared) |
| 4.9 | Orphan cleanup sweep (bucket objects without rows) | VERIFIED (rig) | S (2026-10-27: planted stray flagged, orphans=1, zero false positives; two-key delete rail; T18 root-caused: socket holder maxConnections) |
| 4.10 | Storage bucket provisioned (private `media`) | VERIFIED (catalog + prod DB conventions) | 2026-10-27: created via storage catalog — private, file_size_limit 5 MiB, allowed MIME image/jpeg,png,webp; 2026-10-27 read-only probe: media_variant live on prod, ledger OK, RLS enabled, owner postgres, 0 policies == media_asset convention |
| 4.11 | Public delivery of live-listing photos through /api/v1/media/:id | VERIFIED (local browser) / UNVERIFIED (current prod) | D (2026-10-27 local: anon card/detail/thumb render decoded; 200 with public immutable cache; prod bucket + table exist, awaiting deploy verification — sandbox egress to production DNS is blocked) |

## 5. Viewings, FOO (field operations officer), verification

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 5.1 | Tenant viewing request | VERIFIED (refusal path) / BLOCKED (success path) | S+P (Task 44: TENANT_NOT_VERIFIED baseline correct); success requires identity provider (mock disclosed) |
| 5.2 | Officer dispatch (admin assigns officer) | BLOCKED | Needs admin session on prod; provisioning is an owner-authorized operation (platform-owner script exists) |
| 5.3 | Viewing status transitions + conducted-requires-evidence trigger | VERIFIED (DB trigger live) | DB (pg_trigger: viewing_conducted_requires_evidence) + S (pre-pause) |
| 5.4 | Officer media capture during scheduled visit | VERIFIED (auth/window) / IN REPAIR (pipeline) | S+P (Task 44 auth refusals) |
| 5.5 | Field report → verification state | BLOCKED | Same admin/officer dependency as 5.2 |

## 6. Deals & money (sandbox only)

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 6.1 | Introduction → deal creation with stored financial snapshot | BLOCKED | Downstream of 5.2 (officer makes introductions); code contract R-reviewed (one introduction = one deal) |
| 6.2 | Deal state machine (append-only transitions) | VERIFIED (DB wall) | DB (deal_transition immutability trigger live) + S (pre-pause) |
| 6.3 | Payment initiation from stored snapshots (never client amount) | VERIFIED (code) / BLOCKED (E2E) | R (amount re-derived from snapshotted terms; AmountNotAuthoritativeError) |
| 6.4 | Signed webhook, duplicate idempotency, out-of-order lock, amount mismatch refusal | VERIFIED (live probes) | P (unsigned→401, bogus→401 INVALID_SIGNATURE, 2026-10-27 re-probe); state-path tests pre-pause |
| 6.5 | Escrow ledger double-entry + reconciliation | VERIFIED (schema/triggers) / UNVERIFIED (E2E current prod) | DB (ledger triggers) + S (pre-pause); ledger currently 0 rows (truth state) |
| 6.6 | Live NylonPay | NOT IMPLEMENTED (by rule) | Sandbox only until merchant KYC/approval (external) |

## 7. Dashboards & UX

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 7.1 | Landlord portal (listings, photo manager, agreement status) | VERIFIED | S+P (Task 44 browser: desktop+mobile screenshots) |
| 7.2 | Tenant portal | UNVERIFIED (current prod) | R; re-verify this round |
| 7.3 | Ops console (verification queue, viewings, capture) | BLOCKED | Admin/officer session dependency (5.2) |
| 7.4 | Empty/error/loading states + recovery flows | VERIFIED | P (degraded-DB copy Task 43; honest upload error Task 44) |
| 7.5 | Layout integrity at 412px/1280px | VERIFIED | P (Task 43/44 browser passes); re-audit this round |
| 7.6 | Control center overview (attention band, queues, activity, honest provider status) | VERIFIED (isolated rig, end-to-end) | D (commit c3ede79: real register → dashboard shows 1 waiting application + nav badge; attention tiles all live queries; desktop 1280 + 400px screenshots; empty states honest) |
| 7.7 | Landlord approval queue (/platform/approvals) | VERIFIED (isolated rig) | D (queue lists applicants, landlords first, identity-attempt state, waiting age; Review → routes to decision surface) |
| 7.8 | Approval = operations identity check → activation | VERIFIED (isolated rig) | D (browser: valid NIN + name match → status Active, trail records acting admin; mock provider labelled on-surface) |
| 7.9 | Application rejection with recorded reason | VERIFIED (isolated rig) | D (reason required; decision card + trail show actor/time/reason; status suspended; sign-in refused with generic ACCOUNT_BLOCKED - no reason leak) |
| 7.10 | Decision authorization + stale-state safety | VERIFIED (rig, direct API) | S (anonymous 401, lister session 403, staff target 422, empty reason 400, repeat-decision 409 APPLICATION_NOT_PENDING after fix; concurrent-safe conditional update) |

## 8. Data protection & resilience

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 8.1 | RLS enabled on all public tables | VERIFIED | DB (40/40 tables, 2026-10-23) |
| 8.2 | Append-only immutability wall (11 tables) | VERIFIED | DB (pg_trigger, 2026-10-23) |
| 8.3 | Production export (consistent, checksummed) | VERIFIED | S (first real export 2026-10-23, 76 rows, SHA-256) |
| 8.4 | Restore to separate recovery DB + integrity gates | VERIFIED | S (production-recovery-drill ALL CHECKS PASSED 2026-10-23) |
| 8.5 | Secrets hygiene (no secrets in repo/logs/chat) | VERIFIED | R (gitignored .env*; guarded scripts; worklog discipline) |
| 8.6 | Migration ledger anomaly (2 failed better_auth rows) | VERIFIED (benign) | DB (2026-10-28 read-only audit: both rows rolled_back_at set, applied_steps 0; the SAME migration then applied successfully 18s later, and every later migration incl. media_variants applied after them ⇒ they do NOT block migrate deploy; no production writes made) |

## Standing external blockers (not locally actionable)

1. NylonPay Level-1 KYC + merchant approval (real-money stage).
2. Identity provider contract (currently a disclosed mock).
3. Domain + DNS + Search Console.
4. Counsel review of the 12 open legal questions (docs/LEGAL_QUESTIONS_REVIEW.md).
5. ~~Migration-ledger resolve (owner-approved production metadata write)~~ — RESOLVED as benign 2026-10-28 (see 8.6): the two failed rows are rolled-back history and demonstrably block nothing.
6. GitHub deploy token invalid (2026-10-28): commit c3ede79 (control center + approval workflow) is committed locally on main but NOT pushed — production is still on dc2aa07. Owner must refresh the remote token; push + production re-verification pending.
