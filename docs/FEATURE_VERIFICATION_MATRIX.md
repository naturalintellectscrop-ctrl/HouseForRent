# Feature & User-Journey Verification Matrix

Launch readiness is stated per feature, per the evidence standard: a build,
a route's existence, an HTTP 200 or a mocked test is NOT proof of a journey.
Every status below names its evidence. Re-verified after the 2026-10-23
Supabase resumption; commit lineage e501b97 → 1c9db37 → 75c8c73 → 5649f9a →
c65344e (deployed).

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
| 3.2 | Listing edit (own, pre-publication) | VERIFIED | S (pre-pause) + R (ownership checks unchanged) |
| 3.3 | Publish dry-run blocker list (field_verification, listing_agreement, photography) | VERIFIED | S+P (Task 44: photography gate armed/disarmed on add/delete) |
| 3.4 | Publish-to-live | BLOCKED → IN REPAIR | Was blocked on missing storage bucket; bucket `media` created 2026-10-27 (private, 5 MiB, image-only); full ladder re-run this round |
| 3.5 | Unpublish/withdraw | UNVERIFIED (current prod) | R (state machine reviewed); exercised in pre-pause rounds |
| 3.6 | Agreement acceptance (append-only wall) | VERIFIED | P (Task 44 defect #2 fix verified live) |
| 3.7 | Landlord photo upload/replace/delete (own listing, pre-publication) | VERIFIED (auth matrix) / IN REPAIR (optimization pipeline) | S+P (Task 44: 403/404/415 matrix); this round adds processing pipeline |

## 4. Photography & media pipeline

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 4.1 | Magic-byte content validation (JPEG/PNG), declared-MIME cross-check | VERIFIED | S+P (Task 44: spoof 415) |
| 4.2 | Size cap (4 MB) & count cap (12) | VERIFIED | S+P (Task 44) |
| 4.3 | Transactional rows+bytes with compensation | VERIFIED | R (code contract) + P (upload failures compensated; Task 44 honest-error flow) |
| 4.4 | Visibility: public ⇔ decorates LIVE listing; else uploader/staff/owner | VERIFIED | S+P (Task 44 authorization matrix) |
| 4.5 | EXIF orientation fix + metadata/GPS stripping | NOT IMPLEMENTED → IN REPAIR | This round (sharp pipeline) |
| 4.6 | Optimized variants (thumbnail/card/detail, WebP) + DB metadata | NOT IMPLEMENTED → IN REPAIR | This round |
| 4.7 | Pixel-count / dimension bomb guard | NOT IMPLEMENTED → IN REPAIR | This round |
| 4.8 | Upload request-rate limiting | NOT IMPLEMENTED → IN REPAIR | This round (reuse rate-limit.ts) |
| 4.9 | Orphan cleanup sweep (bucket objects without rows) | NOT IMPLEMENTED → IN REPAIR | This round (ops script) |
| 4.10 | Storage bucket provisioned (private `media`) | BLOCKED → DONE | 2026-10-27: created via storage catalog — private, file_size_limit 5 MiB, allowed MIME image/jpeg,png,webp |
| 4.11 | Public delivery of live-listing photos through /api/v1/media/:id | BLOCKED → IN REPAIR | Unblocked by 4.10; re-verify with variants |

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

## 8. Data protection & resilience

| # | Journey | Status | Evidence |
|---|---------|--------|----------|
| 8.1 | RLS enabled on all public tables | VERIFIED | DB (40/40 tables, 2026-10-23) |
| 8.2 | Append-only immutability wall (11 tables) | VERIFIED | DB (pg_trigger, 2026-10-23) |
| 8.3 | Production export (consistent, checksummed) | VERIFIED | S (first real export 2026-10-23, 76 rows, SHA-256) |
| 8.4 | Restore to separate recovery DB + integrity gates | VERIFIED | S (production-recovery-drill ALL CHECKS PASSED 2026-10-23) |
| 8.5 | Secrets hygiene (no secrets in repo/logs/chat) | VERIFIED | R (gitignored .env*; guarded scripts; worklog discipline) |
| 8.6 | Migration ledger anomaly (2 failed better_auth rows) | FAILED (latent) | DB (finished_at NULL rows block future prisma migrate deploy); owner decision pending |

## Standing external blockers (not locally actionable)

1. NylonPay Level-1 KYC + merchant approval (real-money stage).
2. Identity provider contract (currently a disclosed mock).
3. Domain + DNS + Search Console.
4. Counsel review of the 12 open legal questions (docs/LEGAL_QUESTIONS_REVIEW.md).
5. Migration-ledger resolve (owner-approved production metadata write).
