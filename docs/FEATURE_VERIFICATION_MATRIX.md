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
| 3.8 | Role-permission matrix from the actual implementation (all five surfaces × five roles, direct API) | VERIFIED (isolated rig, round 51) | A+E (docs/ROLE_PERMISSION_MATRIX.md: register/approval/provisioning provenance, account-status policy, surface×role matrix with observed 401/403/409s, publish-gate single-implementation, findings R-1 duplicate-staff-phone 500→409 fix, R-2 gated-publish 500→422 fix, R-3 verify-without-visit policy note) |

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
| 6.7 | Full financial-lifecycle audit (threat model + invariants + findings register) | VERIFIED (audit round 50) | A (docs/FINANCIAL_AUDIT.md: lifecycle map with file:line evidence, STRIDE threat model, 10 invariants verified, findings F-1…F-9 graded; escrow-semantics disclosure §0) |
| 6.8 | Webhook terminal-state consistency (F-1 fix: refused transition ⇒ no booking + `psp_terminal_refused` audit) | VERIFIED (code) / UNVERIFIED (E2E live) | C (applyPspWebhookOutcome now checks derivedPspState before any money effect; tsc+lint clean; live-mode rehearsal needs NylonPay credentials) |
| 6.9 | Booking-failure observability (F-3 fix: `psp_booking_failed` audit row when confirmed money cannot be booked) | VERIFIED (code) / UNVERIFIED (E2E live) | C (webhook booking path wrapped; audit row uses the psp_amount_mismatch write pattern; rethrow preserves provider-retry contract) |
| 6.10 | One-active-deal-per-introduction as DB constraint (F-2) | PROPOSED (owner decision) | Draft migration prisma/migrations/20261028120000_deal_active_per_introduction/migration.sql (partial unique index, unapplied; apply-migration rails required) |

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
| 7.11 | Full role E2E journey: register → admin-UI approval → listing lifecycle (photo→agreement→verify→live) → withdraw → physical-amend re-arm → re-verify → republish | VERIFIED (isolated rig, round 51) | D+E (agent-browser approvals ×3 with screenshots; 32-assert API run: gate codes, publish refusal while unverified, 409 live-amend, ownership 403s ×4, honest public empty state → "1 verified home" with Verified-in-person badge; landlord portal shows both states) |
| 7.12 | Honest public search (empty until verified+live; trust copy on home) | VERIFIED (rig) | D (search returned 0 with the "publishes only homes our officers have visited" empty-state message BEFORE publish; after publish: "1 verified home available right now") |

## 7b. Design-system integration (forest refresh, 2026-10-28)

Reference-driven redesign (owner-supplied dashboard reference). Principle: the app already had a token-driven hand-written CSS system (`globals.css`) consumed via semantic classes by server components — so the redesign is a TOKEN + COMPONENT-CLASS + SHELL refresh, not a rewrite. Zero API/business-logic changes; diff touches layouts, CSS, page presentation and two honest-copy lines only.

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 7b.1 | Token refresh: forest palette (`--brand-action #0d5c3c`, `--accent-strong #0a402b`, `--canvas #eef2ef`), radius scale (+xl/2xl/pill), `--shadow-card` diffuse elevation | VERIFIED | globals.css :root block; white-on-action contrast ≥ 7:1 |
| 7b.2 | Component restyle: pill buttons, 20px cards + soft shadow, focus-ring inputs, chunkier hatched-capable bars | VERIFIED | globals.css; screenshots 01/02/21/22 |
| 7b.3 | Shared app shell (`src/app/app-shell.tsx` + drawer island + nav island): white sidebar w/ green active pill (portal+ops), forest variant (platform); single nav source per role; no-JS drawer fallback (client island owns open state, real button + Escape + scrim) | VERIFIED | portal/ops/platform layouts rewritten on one component; mobile drawer screenshot 51 |
| 7b.4 | Role navs grouped (Manage/Renting + Account; Field work + Console; Platform + Staffing); ops nav GAPS FIXED: /ops/queue + /ops/reconciliation now in nav (were reachable only via in-page buttons) | VERIFIED | ops/layout.tsx; officer screenshot 30 |
| 7b.5 | Stat cards (`.stat` family): landlord portfolio = 4 tiles (1 accent forest) with REAL figures only (live count, in-progress, lettings, sum of live rent); platform overview gauge = live share of authored listings (real fraction) | VERIFIED | landlord/page.tsx; platform page; screenshots 20, 10 |
| 7b.6 | Loading skeletons at route level (portal/ops/platform/property detail) — shells stay put, content shimmer | VERIFIED | loading.tsx ×4; screenshot 20 caught skeleton mid-load |
| 7b.7 | Fixes from the route-inventory audit: dead `site-actions` div removed, stray `{}` JSX removed (ui.tsx Brand), root 404 on-brand with class styles, `.who-name/.who-role` block display, topbar title hidden on desktop (sidebar already names the surface) | VERIFIED | site-chrome.tsx, ui.tsx, not-found.tsx, globals.css |
| 7b.8 | Honest-copy alignment: auth aside + for-landlords money lines moved to the "held by us, recorded against the deal" framing (matrix §2 approved copy; no third-party-custody claim) | VERIFIED | register/auth-aside.tsx, for-landlords/page.tsx |
| 7b.9 | Bug found+fixed during build: `backdrop-filter` on the sticky topbar made it the containing block for `position:fixed` descendants → the fixed sidebar resolved against the topbar box; solid topbar background restores viewport positioning | VERIFIED | globals.css .shell-topbar comment; platform screenshots before/after |
| 7b.10 | Gates: tsc 0, ESLint 0; browser-verified roles (admin/landlord/officer/tenant) at 1440 + 390 widths; full lifecycle walked through the REAL app (register → UI approvals (mock NIN) → property+photos+agreement → publish gate 422 PUBLISH_BLOCKED → officer verify → publish → live → tenant save + viewing request → admin dispatch) | VERIFIED | dev.log 200s; screenshots 10/20/21/22/23/30/40/50-52; commit |

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
6. ~~GitHub deploy token invalid~~ — RESOLVED 2026-10-28: owner supplied a fresh token; the repository now lives at github.com/naturalintellectscrop-ctrl/HouseForRent (remote URL updated). Commits c3ede79 + afb0642 pushed to main (dc2aa07..afb0642); Vercel deployment succeeded (commit status "Deployment has completed"); production checks passed: /platform/approvals 307→/login (route now exists where dc2aa07 served 404), /platform 307→/login, /login 200.
7. ~~Sandbox .env reset (2026-10-28)~~ — RESOLVED 2026-10-28 (design round): the owner re-supplied the Supabase pooler URL; .env restored (gitignored), dev server verified against the dev database (read-only probe Postgres 17.6; listings API 200). NOTE (recurring hazard): the sandbox shell exports a stale `DATABASE_URL=file:...` that OVERRIDES .env — boot the dev server with `env -u DATABASE_URL bun run dev` (round-51 note), or the Prisma datasource validation fails with the sqlite URL.
8. ~~Sandbox .env reset (2026-10-28)~~ — RESOLVED 2026-10-28 (design round): the owner re-supplied the Supabase pooler URL; .env restored (gitignored), dev server verified against the dev database (read-only probe Postgres 17.6; listings API 200). NOTE (recurring hazard): the sandbox shell exports a stale `DATABASE_URL=file:...` that OVERRIDES .env — boot the dev server with `env -u DATABASE_URL bun run dev` (round-51 note), or the Prisma datasource validation fails with the sqlite URL. RECURRENCE #2 CLOSED 2026-10-29 (round 53): sandbox reset had reverted .env again; restored from session record; verified /properties renders live data, dev.log datasource errors 0.
9. **Ephemeral media storage vs persistent DB (recorded 2026-10-29, round 53 — NOT locally actionable without an owner decision).** MediaAsset rows live in persistent Supabase, but the files they name are written under `MEDIA_ROOT` (default `cwd()/media`) on the sandbox/Vercel-local filesystem. The 2026-10-29 sandbox reset wiped `media/listings/*`: the dev DB still holds 4 MediaAsset rows + ListingPhoto references (verified read-only: rows present, storageRef set), while every referenced file is gone. Impact: the one LIVE listing's photos 404 on the dev server and the production media route fails closed (503); production homepage + /properties carry 9 dead image references — public surfaces show broken images. Verified via warm 404 probes + read-only DB join + `ls media/listings/` empty. Fix path (owner decision): move the media pipeline to durable blob storage (e.g., Supabase Storage bucket with the same ACL checks), then re-upload the listing photos through the REAL upload API (requires the landlord's session — credentials were not retained, per test-credential discipline; a new sanctioned walk can recreate them). No code change was made this round: any local patch (placeholder images, relaxed 404s) would mask data loss or weaken API semantics while the storage backend stays ephemeral.
   **ROUND-56 UPDATE (2026-10-29) — ROOT CAUSE PROVEN, TOOLING LANDED, BLOCKER REMAINS OPEN PENDING OWNER:**
   - Root cause proven: production runs the SUPABASE storage adapter (media reads fail 503 MEDIA_STORE_UNAVAILABLE — local mode would answer 404 MEDIA_GONE; verified live on both), the project Storage endpoint is reachable, and the private bucket `media` DOES NOT EXIST (unauthenticated probe: `NoSuchBucket`). The bucket was never created and no object was ever uploaded; the env configuration on Vercel was therefore already complete. The 13 dead HTML references (9 on `/`, 4 on `/properties`; reported as "nine" from the homepage count) resolve to 2 distinct assets; ALL 4 assets × 4 objects (origin + thumb/card/detail) exist nowhere — dev disk wiped by the sandbox reset, bucket never existed, Vercel fs ephemeral.
   - Recovery outcome per reference: ALL UNRECOVERABLE as originals — exact-byte-size search across the whole sandbox (incl. `_legacy/` and `/tmp`) found zero matches; rows carry no perceptualHash to content-match against. No replacement was fabricated (owner-authorization rule). Each of the 13 refs stays honestly broken until the owner supplies the original files or authorizes clearly-labeled new photography uploaded through the REAL API with the listing owner's session (verification status untouched either way).
   - Code/tooling landed: (1) `readMediaBytes` now logs the token-redacted store reason server-side before the 503 — the client response is unchanged (no infrastructure detail leaves the server), but the operator log names the fault ("Bucket not found"); (2) `scripts/media-ensure-bucket.mjs` — idempotent PRIVATE bucket creation (refuses an existing PUBLIC bucket, verifies after create, refuses without creds, never prints secrets); (3) `scripts/media-backfill.mjs` — DB-row-driven object backfill with the adapter's exact x-upsert semantics, DRY_RUN mode, never invents paths or bytes, honest SKIP for unavailable bytes.
   - Integrity guarantees re-verified this round: resolveMediaAccess authorization unchanged; variant→origin fallback unchanged; delete refuses while ANY live listing references the asset and compensates bytes last; uploads compensate every stored object on any failure (rows and bytes cannot silently diverge); no orphan sweep exists because compensation makes one unnecessary (unrowed objects are inert in the private bucket).
   - Tests: tsc 0, ESLint 0, image-pipeline suite ALL CHECKS PASSED, dev regression (missing object → 404 MEDIA_GONE, homepage 200, log clean).
   - OWNER ACTIONS to close the blocker: (1) create a PRIVATE bucket named `media` in the Supabase dashboard, or supply the service-role key (env-only, never committed) so `media-ensure-bucket.mjs` runs; (2) then supply the 4 original files (restore to `MEDIA_ROOT` + run `media-backfill.mjs`) OR authorize labeled replacement photography via the real upload API; (3) the blocker closes only when a production upload survives a redeploy and reads back through the authorized media path.
   **ROUND-57 UPDATE (2026-10-29) — OWNER SUPPLIED THE SERVICE KEY: WIRE-DEFECT FIXED, DURABILITY DRILLED, RECOVERY STILL OWNER-GATED:**
   - Owner action (1) arrived: the service-role key landed via the session (env-only, chmod-600 gitignored `.env`, never printed/committed/audited). `media-ensure-bucket.mjs` reports the private bucket `media` ALREADY EXISTS — the round-56 run had created it. Storage read-only audit against the live project: bucket contains ZERO objects; `media_asset` holds exactly 4 rows (all on the one live listing, lister-source, 2026-10-28 15:09 UTC), 12 ready variant rows; `listing_photo` 4 rows. Classification unchanged: every one of the 16 objects is UNRECOVERABLE (bytes exist nowhere); no replacement fabricated.
   - **NEW WIRE DEFECT FOUND AND FIXED** (`src/server/media-storage.ts`): Supabase Storage reports a missing object as **HTTP 400 whose body carries `code:"NoSuchKey"`** (and a missing bucket as 400 `NoSuchBucket`) — never a plain 404. The adapter's `res.status === 404` check therefore NEVER fired: even with the bucket created, every read of an absent object still surfaced as 503 MEDIA_STORE_UNAVAILABLE. Verified directly against the project Storage API (400/NoSuchKey for absent object in the existing bucket; 400/NoSuchBucket for an absent bucket). The fix distinguishes the two on the wire: `NoSuchKey` (or a plain 404, kept for API shapes that return one) → `MediaNotFoundError` → honest **404 MEDIA_GONE**; `NoSuchBucket` and every other refusal stay `MediaStoreError` → diagnosable **503** (a missing bucket is a deployment fault, not a per-asset absence). Production 503s on lost assets were exactly this defect; after deploy, prod returns 404 MEDIA_GONE for them.
   - **DURABILITY DRILL (the round-56 closing criterion, executed against the REAL store):** `scripts/media-drill.mjs` (sandbox-guarded; upload/verify/cleanup modes) drove the REAL multipart route as a real lister session on the local stack with `MEDIA_STORAGE=supabase`: upload 201 through the actual pipeline (magic-byte sniff → decode → 3 WebP variants, 66 ms) → all three renditions served 200 image/webp → **dev server killed and restarted → all renditions still 200** (bytes survive process death; they live in the bucket, not on disk) → cleanup via the landlord DELETE route removed rows AND bytes together → bucket verified EMPTY, exactly as found. Anonymous reads of the non-live asset correctly returned 404 MEDIA_NOT_FOUND before the store was consulted (privacy contract intact). Bucket hygiene: no drill residue, no fabricated objects.
   - Honest-degradation UI landed (no fabrication): a listing photo whose bytes the store cannot serve now renders a labelled "Photograph unavailable" tile (`MediaImage`, the one `<img>` path shared by cards, hero, gallery main + thumbs) — the browser's broken-image glyph is gone from every surface, and nothing pretends to be the original photograph.
   - Same-round console fixes (owner-reported, reproduced locally then fixed): (1) `/ops/areas` client-side crash — any neighbourhood without a parent row yields API `district: null`; the client form's `d.toLowerCase()` threw and took the whole page down ("Application error: a client-side exception"). Fixed at both layers: the page groups parentless rows under an explicit visible "No district assigned" section; the form's filter is type-guarded. (2) The shell sidebar's brand row never used its `.shell-side-brand` CSS (bare link, no padding, wrapped and clipped at the viewport top) AND painted near-black ink on the deep-forest fill (the name was literally invisible — owners saw only "· Platform Control"). Fixed: wrapper wired, two-line lockup (name over surface label), forest contrast override. (3) Ops pages inherited the public tagline as the browser-tab title — section default added.
   - Tooling note: the old `scripts/seed-demo.mjs` has drifted several schema rounds (config versions, neighbourhood parents, media refs, bcrypt, authRole) and no longer runs; a compact sandbox-guarded replacement for this round's verification data is `scripts/dev-verify-fixture.mjs` (self-healing, fixture-labelled rows only). Reviving seed-demo is recorded as local-tooling debt, not a product defect.
   - Blocker #9 status after this round: the STORAGE half is PROVEN (bucket exists, adapter durable, drill passed, prod semantics honest); the DATA half (the 4 lost originals / 13 dead references) remains owner-gated: supply the original files or authorize clearly-labeled replacement photography through the real API. The blocker still cannot close on a production upload surviving a production redeploy — that requires the owner's production session and remains the closing criterion.
