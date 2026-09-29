# House For Rent — Worklog & Continuity Document

**Company:** Natural Intellects Ltd (NI) · **Product:** House For Rent · **Operator:** Web takeover agent, session `web-72ba74ab`

This is the continuity document for the sandbox working copy at `/home/z/my-project`.
The authoritative repository is `github.com/naturalintellectscrop-ctrl/HouseForRent`
(clone kept at `/home/z/HouseForRent-audit`, reference extracts at `/home/z/hfr-reference`).

---

## Task ID: 0 — Ground-truth audit (2026 audit date, before any code change)

### What was inherited

**The real repository (verified by reading code, not commit messages):**

- Monorepo: `apps/web` (Next.js 16.2.12, App Router, thin client) + `apps/api` (NestJS + Prisma + PostgreSQL, 10 migrations).
- `_legacy/` already quarantines the old sandbox-era artifacts (db, prisma, src, mini-services, upload, tool-results, examples, .zscripts). Nothing in `apps/` references it. Safe to leave archived.
- SSOT documentation set is genuinely excellent and current: `CLAUDE.md` (orientation), `docs/House_For_Rent_Business_Discovery_Summary.md` (11 frozen decisions), PRD, Technical Architecture, Data Model, API Spec, DOMAIN.md (stage log), AUTHENTICATION.md, DEPLOYMENT.md, `HOUSE_FOR_RENT_ENGINEERING_FINDINGS.md` (F-001…F-017 with statuses), `HOUSE_FOR_RENT_CONNECTIVITY_MATRIX.md`.
- Hand-written design system in `apps/web/app/globals.css` (2,053 lines, two registers: marketplace vs `.ops` console), `ui.tsx` (server-rendered shared components, thin-line SVG icons), `site-chrome.tsx`.

**Verified status of historical findings (from the findings ledger + code):**

| Finding | Status in repo |
|---|---|
| F-001 create-deal endpoint | CLOSED — implemented, deal derived from introduction record |
| F-002 viewing dispatch queue | CLOSED — `/ops/dispatch` + assign flow |
| F-003 property/listing authorship | MOSTLY CLOSED — landlord authors, FOO verifies, publish is server-gated. Remaining half: **mandate submission has no route** (brokers/management cannot publish) |
| F-007 deal exit/transitions UI | CLOSED — `/ops/deals/[id]` with server-derived `availableActions` |
| F-009 committed seed passwords | CLOSED — `seed-web-demo.mjs` refuses to run without `DEMO_PASSWORD` |
| F-011 API-bypassing tests | CLOSED — `scripts/journey-http.mjs` (56/56 steps, no DB connection) |
| F-012 caller-supplied amounts | CLOSED & VERIFIED — server-derived amounts; wrong amount → 422 `AMOUNT_NOT_AUTHORITATIVE` |
| F-013 mobile client state machine copy | SUPERSEDED — Expo app removed, web-first |
| F-014 sign-agreement unreachable | CLOSED |
| F-015 neighbourhood creation | CLOSED |
| F-016 `@Roles('lister')` conflation with ownership | CLOSED |
| F-017 no client could verify identity | CLOSED — mock identity provider behind `IdentityProvider` |

**Genuinely open in the real repo (external or deliberate):**

1. **Vercel deployment unverified** — vercel.json exists (workspace-aware build, security headers, no-store on portal routes); needs credentials/infra.
2. **API host not provisioned** — NestJS API needs a long-running host (Fly/Railway/VPS); web is thin client over `API_BASE_URL`.
3. **Mandate submission route** — the remaining half of F-003.
4. **API Jest suite not re-run** since the web migration (read contracts widened).
5. **Photograph persistence** needs a disk (MEDIA_ROOT) in production.
6. **Rate limiting** deferred; add at the edge before public launch.
7. **PSP is a mock** (behind `PaymentProvider`) and **identity provider is a mock** (behind `IdentityProvider`) — by design, honestly labelled. Real PSP = external launch dependency.
8. **Auth migration to Supabase** (3 latest commits by v0 agent) — code paths exist in `apps/web/lib/supabase`, `apps/api/src/auth/supabase-admin.ts`; requires Supabase project credentials to actually run.

### This sandbox's constraints (drive the working-copy strategy)

- One Next.js 16 app at `/home/z/my-project`, port 3000 only, SQLite via Prisma (no PostgreSQL, no NestJS process, no Supabase credentials, no Vercel credentials).
- Preview panel shows the app served from `/` — multi-route navigation works from there.
- Stack: Tailwind 4 + shadcn/ui present, but the repo's hand-written design system takes precedence for brand fidelity (shadcn primitives used only where genuinely interactive, e.g. toasts).

### Decision (recorded, with reasoning)

**D-1. Sandbox deliverable = faithful single-process port of the House For Rent web product.**
The real repo is already coherent; rebuilding it there is not possible from this sandbox (no Postgres/Supabase/Vercel). What the business needs to *see* is the web product running. Therefore:

- Port the domain model to SQLite (same models, same state machine, BigInt money, string-on-the-wire).
- Implement the API contract as Next.js route handlers under `/api/v1/*`, backed by a server-only **service layer** (`src/server/services/*`) — the same separation of duties the NestJS modules provide, so service code can be lifted back into the NestJS API later.
- Server components read through the same service layer (one implementation of business rules); browser mutations go through `/api/v1/*` fetch — the browser never computes business value (CLAUDE.md §5 invariant).
- Auth: local credential sessions (scrypt + HMAC-signed httpOnly cookie) replacing Supabase, which cannot run here. Divergence recorded; the real repo keeps Supabase.
- Design system, copy, routes, honesty rules: **ported, not reinvented**.
- Demo data: clearly labelled `development_fixture` artwork, same as the repo's convention. No fake statistics, no testimonials.

**D-2. What is NOT done here:** real PSP integration, real identity provider, Vercel deployment (external dependencies — see deployment checklist at the end of this file).

### Audit matrix (live)

| Area | Real repo state | Sandbox working copy | Action here |
|---|---|---|---|
| Repository | Monorepo, clean, `_legacy` quarantined | Single app `/home/z/my-project` | Build faithful port |
| Web | 32 routes, builds, Playwright-verified | — | Port routes + design system |
| API | NestJS, journey-verified 56/56 | — | `/api/v1/*` route handlers + services |
| Database | PostgreSQL, 10 migrations, immutable-table triggers | SQLite | Adapt (atomicity via transactions; SQLite serialises writes) |
| Auth | Supabase (needs external creds) | — | Local scrypt + signed cookie sessions |
| Tenant flow | Verified via journey-http | — | Build: browse→viewing→deal→fund→move-in |
| Landlord flow | Verified | — | Build: property→listing→agreement→publish→deals |
| FOO flow | Verified | — | Build: dispatch→conduct→field report→introduction→deal |
| Admin flow | Verified | — | Build: dispatch, deals w/ availableActions, audit, config |
| Ledger/escrow | Invariants verified (funded 3.6M = commission 1.2M + released 2.4M) | — | Port postings exactly |
| Deployment | vercel.json ready, unverified | N/A (sandbox) | Checklist documented |
| Docs | SSOT current | worklog.md | Keep updated |

### Priority order (P0 → P3) for the sandbox build

- **P0** Prisma schema + seed (labelled fixtures), auth/session, service layer, deal state machine + server-derived money.
- **P1** Public marketplace (home, properties, detail, how-it-works, for-landlords, about, contact), login/register, tenant portal (identity, viewings, deals), landlord portal (properties/listings, agreement, publish), FOO/ops console (dispatch, viewings, field reports, introductions, deals), admin (audit, config).
- **P2** Design polish pass on top of ported system; responsive verification; empty/loading/error states.
- **P3** Extras: ops reconciliation view, config versions, neighbourhood admin.

---

---
Task ID: 6
Agent: main agent (takeover)
Task: Server layer + API + design system + public marketplace + seed

Work Log:
- Ported domain (state machine, commission engine, action catalogue) verbatim: src/server/domain.ts
- Ported double-entry ledger + escrow primitives + PSP seam: src/server/ledger.ts (mock PSP labelled in event detail)
- Ported deals service (createFromIntroduction, matchTenant, signAgreement snapshot, fundEscrow derived amount + tripwire, move-in, earnCommission, settle, refund, cancel, dispute hold/resolve, financialSummary, availableActions): src/server/deals.ts
- Ported listings/search/publish gate (4 gates, computed staleness, blockedBy) + config + taxonomy: src/server/listings.ts
- Ported viewings (identity gate, frozen graph, field reports, immutable introductions, verifyListingFromVisit): src/server/viewings.ts + viewing-state-machine.ts
- Identity mock + staff provisioning + audit + reconciliation queues: src/server/ops.ts
- HTTP edge with domain→status mapping (404-not-403 for non-parties): src/server/http.ts
- 22 route handlers under /api/v1/* (auth, listings, landlord, viewings, deals/[id]/[action], identity, media, ops)
- Design system copied verbatim (globals.css 2053 lines, proof-strip.css, ui.tsx, logo/favicon); in-process API adapter src/lib/api.ts preserves the exact API contract shapes; client-safe postJson: src/lib/client.ts; session helpers: src/lib/session.ts
- Public marketplace ported near-verbatim: (site)/home, properties, properties/[id], how-it-works, for-landlords, about, contact; login + register with fetch-based forms
- Auth: scrypt + SHA-256-hashed session rows + httpOnly cookie (Supabase divergence recorded in D-1); account-status policy enforced at login
- Seed: scripts/seed-demo.mjs (refuses without DEMO_PASSWORD, F-009) + scripts/walk-demo.mjs (deal walks via real services); fixture SVGs labelled DEMO IMAGE, source=development_fixture

Stage Summary:
- FIXES MADE DURING VERIFICATION (root causes, not patches):
  - fundEscrow issued the PSP instruction inside the DB transaction (deadlock with connection_limit=1 + violates the real API's ordering) → hoisted out; amount re-derived inside tx
  - Prisma interactive-transaction budget raised to 30s (P2028/P1008 under bun)
  - SQLite URL: connection_limit=1&socket_timeout=60 (serialised writer)
  - db client query-logging opt-in (DEBUG_QUERIES)
  - tsc target ES2020 (BigInt literals); relation names aligned to schema (owner, listingAgreements)
- VERIFIED: all 8 public pages 200; /api/v1/listings feed honest-empty then 3 fresh listings (stale correctly excluded by freshness gate); login 200/401; unverified tenant can sign in (policy) but cannot request viewings (TENANT_NOT_VERIFIED service gate)
- LEDGER VERIFIED: all postings balanced; Naalya deal closed (funded 1,350,000 = commission 135,000 + released 1,215,000, escrow 0); Ntinda deal escrow_funded awaiting move-in; one transaction timeout rolled back ATOMICALLY (no partial ledger) — invariant demonstrated in practice
- REMAINING: tenant/landlord portal pages (Task 7-a), ops console (Task 7-b), agent-browser E2E pass, lint pass

---
Task ID: 7-a
Agent: portal-port agent (tenant + landlord portals)
Task: Port /account/* and /landlord/* portals from /home/z/hfr-reference/app/(portal)/, with HTTP-API client forms

Work Log:
- Ported the portal shell verbatim: (portal)/layout.tsx + account/layout.tsx + landlord/layout.tsx (convenience gates via src/lib/session; sign-out is a plain HTML form to POST /api/v1/auth/logout, matching the site-chrome pattern, since the reference's logoutAction server action does not exist here)
- Tenant pages ported with copy verbatim: account/page.tsx (overview, identity-first ordering), account/viewings/page.tsx (?requested=1 notice), account/viewings/new/page.tsx (identity courtesy check), account/deals/page.tsx, account/deals/[dealId]/page.tsx (404-not-403 passthrough)
- deal-view.tsx ported verbatim (progress trail, server-offered availableActions, ledger-derived money panel, transitions history). Deviation: it imports DealAction from (portal)/deal-action.tsx — a NEW portal-local client component ported from the reference's ops deal-action — because src/app/ops/* did not exist when ported and belongs to Task 7-b. It renders label/consequence/fields/reversibility straight from availableActions and POSTs to /api/v1/deals/[id]/[action] with the `confirm` checkbox stripped; refreshes even on failure (stale-page rule); ILLEGAL_TRANSITION gets the reference's special message
- Identity page + identity-form.tsx: mock-provider notice kept verbatim; form adapted to the sandbox contract POST /api/v1/identity {method:'nin', nin, fullName} (the reference's phone field became the full-name field the mock actually checks). A `failed` state renders an honest notice (no invented register story); `verified` renders the ok message + router.refresh()
- Landlord pages ported with copy verbatim: landlord/page.tsx (blockedBy is the design), landlord/properties/new/page.tsx + property-form.tsx (money fields controlled, submitted as integer-shilling STRINGS; success forwards to /landlord/listings/[id]?created=1 as the reference did), landlord/listings/[listingId]/page.tsx + agreement-panel.tsx + publish-panel.tsx, landlord/deals/page.tsx + [dealId]/page.tsx
- publish-panel.tsx posts {dryRun:true} first and only publishes when the server says canPublish; a dry-run failure renders the server's own blockedBy list in landlord vocabulary (publishListing throws a plain Error here, which maps to 500 INTERNAL — the dry run avoids ever surfacing that)
- photo-manager.tsx: NO upload control faked. Honest disabled state + "Photography is added by field officers during verification visits"; existing photos render from /v1/listings/[id]/photos with server-asserted provenance labels
- ADDED three HTTP route handlers (GET had no handler; browser got 404 HTML although the paths exist in the contract and the in-process adapter): src/app/api/v1/viewings/mine/route.ts, src/app/api/v1/identity/me/route.ts, src/app/api/v1/listings/mine/route.ts. Each is requireRole(...) + a forward to the EXISTING in-process resolver (one implementation of the shape; no api.ts change). Static segment `mine` correctly beats the dynamic [id] listing route
- No changes to: src/server/*, prisma/*, src/lib/api.ts, src/app/(site)/*, src/app/ops/* (Task 7-b owns it; the tsc errors currently visible there are theirs, mid-flight), package.json

Verification:
- npx tsc --noEmit: ZERO errors in files created by this task (remaining errors are all under src/app/ops — Task 7-b's in-progress files). ESLint on (portal) + new routes: clean
- HTTP: tenant Grace (+256700100010): /api/v1/viewings/mine, /api/v1/deals, /api/v1/identity/me all 200 JSON; landlord Sarah (+256700100001): /api/v1/listings/mine 200 JSON (draft listing with blockedBy [field_verification, outside_service_area, listing_agreement])
- Pages all 200: /account, /account/deals, /account/deals/<escrow-funded deal>, /account/identity, /account/viewings, /account/viewings/new?listingId=<feed id>, /landlord, /landlord/properties/new, /landlord/listings/<id>, /landlord/deals, /landlord/deals/<id>. Cross-role/anonymous → 307 to own surface/login. Rendered-content spot-checks pass (deal trail, confirm-move-in offered from availableActions, escrow figures, circumvention clause, photo provenance labels)
- Real mutation over HTTP on the UNVERIFIED demo tenant +256700100012 (Joan Kembabazi): wrong name → 201 {state:'failed'}; then valid NIN CM99123456ABCD + exact name → 201 {state:'verified'}; /api/v1/identity/me flips to identityVerified:true. The pre-existing escrow_funded deal was NOT walked (left for ops agent)
- dev.log: no errors from portal pages or new routes

Stage Summary:
- Both portals are live end-to-end over real HTTP: browse → identity → viewing request → deal view with server-offered actions (tenant side); property authorship → agreement → publish gate (landlord side). Every mutation crosses /api/v1 and is re-authorised server-side; no money arithmetic, action derivation, or status→copy decisions exist in the client beyond the ported presentation tables
- Known gaps to carry forward: GET /v1/listings/[id]/agreement and /v1/listings/[id]/photos still have no HTTP handlers (pages read them in-process; browser fetches not used for them); lister photo upload intentionally absent (provenance rule); ops console + shared ops DealAction remain Task 7-b

---
Task ID: 7-a
Agent: full-stack-developer (subagent)
Task: Port tenant portal (/account/*) + landlord portal (/landlord/*) from reference

Work Log:
- Ported portal layout + account (dashboard, viewings, viewing request, deals, deal detail, identity) + deal-view + deal-action (portal) + landlord (dashboard, property/new, listing detail w/ agreement + publish + photo panels, deals) — 18 files
- Converted all 'use server' actions to postJson() client components over real /api/v1 HTTP
- Added HTTP routes /api/v1/viewings/mine, /api/v1/identity/me, /api/v1/listings/mine (contract paths that existed only in the in-process adapter)
- Honest deviations: photo upload replaced with provenance-explaining disabled state; publish panel dry-runs first and renders server blockedBy; identity mock clearly labelled

Stage Summary:
- tsc clean (own files), ESLint clean; 11 portal URLs 200; cross-role/anonymous → redirects
- HTTP verified: tenant/landlord reads 200; identity verification flips Joan to verified (mock, honestly labelled)
- Left the escrow_funded deal untouched for demo purposes

---
Task ID: 7-b
Agent: full-stack-developer (subagent, files written) / main agent (verification, worklog)
Task: Port operations console (/ops/*) from reference

Work Log:
- Subagent wrote all 19 ops files (dashboard, dispatch, queue, today, viewing detail w/ field-report + close-visit + open-deal + media-capture, deals + deal-action, introductions, audit, reconciliation, config + version forms) but hit context deadline before verification; main agent verified in its place
- Server actions → postJson() client components; deal-action renders ONLY server-provided availableActions with consequence text + confirmation

Stage Summary:
- VERIFIED by main agent: tsc clean project-wide; all 9 ops pages 200 as admin; /ops/today 200 as officer; admin APIs return live data (launch gate 3/12 honest shortfall; deal distribution {closed:1, escrow_funded:1}; dispatch queue 1 row + officer load 1)
- POST /api/v1/ops/reconciliation → {ledgerBalance:"4950000", pspBalance:"4950000", isReconciled:true}
- Full journey present: dispatch → field report → conduct → open deal → match → sign → fund → move-in → earn → settle → close, all through /api/v1 over HTTP

---
Task ID: 8
Agent: main agent (takeover)
Task: End-to-end browser verification of every role journey + hardening

Work Log:
- agent-browser verified the PUBLIC marketplace: home (real count, honest thin-corridor copy, labelled Demo image fixtures), /properties (filters + sort + honest empty state), property detail (server-derived expectedUpfront UGX 1,900,000 = 950k×1mo + 950k deposit; verification section; "free for tenants" copy), mobile 412px renders correctly with <details> menu
- TENANT (Grace, +256700100010): signed in via browser → account overview → tenancy list → deal detail: progress trail with "where you are now", server-provided Confirm move-in gated behind a checkbox ("This CANNOT be undone"), history table, money section → EXECUTED confirm-move-in via browser → trail updated, transition written (escrow_funded → move_in_confirmed), action list emptied ("Nothing is waiting on you")
- ADMIN (Operations Desk, +256700100030): ops dashboard (launch gate 3/12 with honest shortfall note; stale inventory counted separately), deals queue, deal detail (ledger-derived figures; data-minimisation note; frozen rate 3000bp) → EXECUTED recognise-commission (360,000 = 1.2M × 3000bp/10000) → settle (server-derived UGX 3,240,000 = 3.6M − 360k, F-012 visible in the confirmation copy) → close — all via browser, checkbox-gated
- FOO flow: admin dispatched the queued viewing (queue drained to honest empty state) → officer Michael signed in → /ops/today → opened visit → filed STRUCTURED field report (good / matches / available) → conducted → immutable introduction record created → "Open the deal" offered with explanatory copy
- LANDLORD (Sarah, +256700100001): portfolio shows live/progress split with server-computed blockers ("Waiting for a field officer to visit", "outside the area we currently cover", "agreement not accepted"), availability confirmed-dates
- Fixed: /api/v1/viewings/mine + /identity/me + /listings/mine 500-on-anon (stale compile race) → now correct 401 UNAUTHENTICATED shape
- Created webDevReview cron job (job 423191, every 15 min)

Stage Summary:
- ALL FOUR role journeys verified through the real browser UI; the full money path (escrow → move-in → commission 360,000 → settle 3,240,000 → close) executed via real HTTP through real controls
- Ledger postings all balanced throughout; escrow discharged exactly; every irreversible action checkbox-gated with server-written consequence text
- tsc 0 errors, ESLint 0 errors, no 5xx in dev.log
- Demo state now: 4 live listings (stale one correctly out of search), 1 closed deal (complete books), 1 escrow_funded→move_in_confirmed deal (admin can earn/settle/close to reset the demo), 2 conducted viewings, 1 scheduled visit on the officer board

## Deployment checklist (real repo — external dependencies, cannot be done from this sandbox)
1. Push the real repository improvements (this sandbox is a working product demo; the NestJS API in the real repo is journey-verified 56/56)
2. Vercel project: root=repo, vercel.json already workspace-aware (build `npm run build --workspace @hfr/web`, output apps/web/.next); set NEXT_PUBLIC_MEDIA_BASE/API_BASE to the API host
3. API host (Fly/Railway/VPS) for NestJS: DATABASE_URL (Postgres), JWT_SECRET, MEDIA_ROOT persistent disk, SUPABASE_URL/ANON/SERVICE_ROLE (auth), DEMO_PASSWORD only for demo
4. Run `prisma migrate deploy` (10 migrations, append-only — no destructive ops needed)
5. Real PSP behind PaymentProvider seam (launch dependency — ledger is correct without it, but money is not actually moving)
6. Real identity provider behind IdentityProvider seam (currently mock, labelled everywhere)
7. Rate limiting at the edge before public launch (deferred per DOMAIN.md)
8. Mandate submission route (remaining half of F-003) — first backlog item for the real repo

---
Task ID: 9
Agent: main agent (QA + feature round)
Task: Status assessment, agent-browser QA, bug fixes, new features (saved homes, activity feed, users directory), styling detail pass

Work Log:
- QA pass (agent-browser, desktop 1440 + mobile 412) found and FIXED 4 defects:
  1. span.stack-sm inline collapse — `.stack-sm` only stacks BLOCK children; list rows across /account, /account/viewings, /account/deals, /landlord used `<span className="stack-sm">` with inline children, so title/address/status ran together in one line. Root fix: CSS rule making span-carrying stacks vertical flex containers (+ `alignItems:'flex-end'` on the 3 right-aligned rows). Verified visually on all affected pages.
  2. Ops dashboard "Freshness window" card rendered `14 days` with a bordered `.hero-unit` box overlapping the card title → now uses `.kpi-state`. Verified.
  3. Account overview said "Nothing booked" while /account/viewings showed 2 conducted viewings (contradictory data = AI-slop rule violation) → empty state now distinguishes "No viewings booked right now" (with past-viewings sentence + link) from the truly-empty case. Verified.
  4. `.section { padding: X 0 }` shorthand clobbered `.page`'s horizontal gutter wherever combined (`page section`) → /properties header sat flush on mobile. Changed to `padding-block` so the gutters survive. Verified 412px + desktop.
- QA utility: scripts/qa-reset-password.mjs (refuses without QA_PASSWORD, F-009 pattern) resets sandbox demo credentials; QA password lives in .env.local (gitignored, never committed). All 7 demo accounts now signable for QA rounds.
- Contract gap CLOSED: GET /api/v1/listings/[id]/agreement + GET /api/v1/listings/[id]/photos route handlers added (paths existed in contract + adapter but returned Next.js 404 HTML to real HTTP clients). Both forward to the in-process adapter (one implementation).
- FEATURE — Saved homes (tenant bookmarks), ADDITIVE ONLY:
  - prisma: new `SavedListing` model (+ relations on Party/Listing); `bunx prisma db push` on sandbox SQLite; no existing table touched.
  - src/server/saved.ts: saveListing (upsert, idempotent), unsaveListing (deleteMany, idempotent), isSaved, listSaved (returns feed-shaped SearchResult[]; saved homes that left search are counted honestly in hiddenCount, not shown or dropped). photoToView exported from listings.ts for reuse.
  - API: POST+DELETE /api/v1/listings/[id]/saved, GET /api/v1/listings/saved (tenant-only, party from session). ListingNotFound → 404 mapping added to http.ts.
  - UI: SaveToggle client component on property detail (aria-pressed, optimistic flip + rollback on failure, server truth via router.refresh); anonymous visitors get a sign-in affordance instead of a fake button; /account/saved page (same PropertyCard as the feed, hiddenCount notice); "Saved homes" nav link for tenants. DELIBERATE: no save button on PropertyCard — the card's documented no-invented-facts rule stands (a private bookmark is a real fact; a card heart-count would not be).
  - Verified in browser: save → 201 → card appears on /account/saved → unsave → empty list. NOTE: first implementation split POST/DELETE into two Write calls to the SAME file — the second overwrote the first and POST 405'd; fixed by merging exports in one file.
- FEATURE — Recent activity feed (tenant + landlord):
  - src/server/activity.ts: rows derived ONLY from real records (DealTransition + viewing status), capped 8, newest first; sentences written server-side per role (tenant vs landlord vocabulary); no unread counters/badges — the product doesn't claim a notification system it doesn't have.
  - API: GET /api/v1/activity/mine (tenant|lister; admin → 403). UI: shared (portal)/activity-feed.tsx + CSS timeline list; sections on /account and /landlord. Verified both roles with correct role-specific phrasing.
- FEATURE — Admin users directory /ops/users:
  - adminUserDirectory(query?) in ops.ts: role/status/identity-verified/listing+deal counts/joined; DELIBERATE data-minimisation line drawn in code comments: no identity documents, no ledger balances (those stay subject-scoped in the audit trail — same line the audit page draws). GET search form (?q=), shareable URLs.
  - API: GET /api/v1/admin/users?q=; DirectoryRow type exported from lib/api.ts (createdAt normalised to ISO for real-HTTP shape parity); nav link (admin only). Verified: 7 rows, search=1 row, honest empty state.
- STYLING detail pass: interactive PhotoGallery on property detail (client component; main image + thumbnail film strip; real <button> thumbs, aria-current, labelled group; provenance "Demo image" badges preserved incl. per-thumb "demo" flag; alt text follows selection). Learned: functions cannot be passed server→client (first version 500'd; fixed with plain-data altBase prop). Old static gallery classes remain for any future use; hero-unit/kpi-state separation kept.

Stage Summary:
- tsc 0 errors, ESLint 0 errors/warnings, ledger untouched, no destructive DB change (one additive table), demo data unchanged (0 saved rows, no deals walked).
- Fixed 4 genuine UI/UX defects, closed the last 2 contract-gap routes, shipped 3 new features (saved homes, activity feed, users directory) and the interactive gallery.
- New files: src/server/{saved,activity}.ts, api/v1/listings/{saved,[id]/{agreement,photos,saved}}, api/v1/activity/mine, api/v1/admin/users, (portal)/account/saved/page.tsx, (portal)/activity-feed.tsx, ops/users/page.tsx, (site)/properties/[id]/{save-toggle,photo-gallery}.tsx, scripts/qa-reset-password.mjs.
- External risks unchanged: real PSP, real identity provider, API host provisioning, Vercel credentials (see Task 0 checklist).
- Next steps: mandate submission route (F-003 second half) still the first backlog item for the real repo; ops deal queue bulk actions; neighbourhood admin (P3); consider saved-search alerts only after a real notification channel exists.
