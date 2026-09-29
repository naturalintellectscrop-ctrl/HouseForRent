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

---
Task ID: 9
Agent: main agent (takeover, QA + feature round)
Task: Status assessment + agent-browser QA, then new features (password change, landlord earnings, areas directory) + styling detail pass

Work Log:
- STATUS ASSESSMENT: swept every route (8 public, 5 tenant, 4 landlord, 10 ops) — all 200 with correct role redirects; tsc 0 errors; ESLint clean; dev.log had one historical runtime error (function-prop across server→client boundary on /properties/[id]) already fixed in a prior round; no new 5xx. Verdict: STABLE, so the round moved to features per instructions.
- Dev server note: the auto-run `bun run dev` died twice mid-session (log ends, port refused). Restarted with `setsid nohup bun run dev >> dev.log 2>&1 < /dev/null &` from /home/z/my-project. Future agents: if curl returns 000, check the process first; the previous background job does not survive the session.
- FEATURE A — password change (security):
  - src/server/auth.ts: `changePassword(session, current, next)` — current password re-verified through the same dummy-hash path as sign-in (stolen cookie alone cannot replace credentials); 8-char policy + must-differ checks; transaction updates credential hash, revokes all OTHER sessions (current survives — deliberate asymmetry), writes `password_changed` audit row.
  - POST /api/v1/auth/password (route handler): 403 INVALID_CURRENT_PASSWORD (session valid, person typing may not be), 422 PASSWORD_POLICY, 401 anonymous.
  - Shared form src/app/(portal)/password-form.tsx rendered by BOTH /account/security (tenant) and /landlord/security (landlord) — the account layout restricts to tenant+admin, so the landlord surface needed its own path; fraud-warning copy differs per side.
  - Portal nav updated: Security link for tenant/admin/landlord in desktop nav + mobile <details> menu.
- FEATURE C — landlord earnings (server-derived, ledger-authoritative):
  - src/server/deals.ts: refactored financialSummary's inline closures into reusable `ledgerBalance`/`ledgerCreditsByReference`/`ledgerEntriesFor` (no behaviour change); added `landlordFinancials(partyId)` — per-deal held/owed/reduced flows from ledger postings, totals summed server-side in BigInt; money stays string-on-the-wire.
  - GET /v1/landlord/financials added to the in-process resolver (role gate: lister) + HTTP route src/app/api/v1/landlord/financials/route.ts (requireRole(['lender'→'lister'])). NOTE: requireRole(['lister']) is correct in the file.
  - /landlord/earnings page: four metrics (Paid to you / Waiting to be paid / Held in escrow / Commission charged) + per-deal rows linking to deal detail + "How money reaches you" explainer. Admin gets an honest redirect-to-ops note instead of a fake empty state. No projections, no benchmarks, no invented statistics.
- FEATURE B — public areas directory /areas:
  - Server component groups in-service neighbourhoods by district using the taxonomy endpoint's live counts (same counts search uses — cannot drift). Zero-count areas stay visible with "No verified homes here yet" (honest, and the right answer for landlords asking where we operate).
  - New CSS: .area-grid/.area-card(+ -empty)/.area-count appended to globals.css (responsive 1/2/3 columns). Footer "Areas we cover" link + home page "All areas →" chip (and a chip when no areas have homes).
- STYLING DETAIL PASS:
  - PropertyCard copy: "Available yesterday" → "Confirmed available yesterday" (the claim is about the last visit; the verb now carries that — matches the detail page's "Confirmed {x}").
  - PhotoGallery: arrow/Home/End keyboard navigation between thumbnails (focus follows selection), aria-live "Photo X of Y" announcement, adjacent-image preload via <link rel=preload> (presentation only, cleaned up on change).
  - globals.css already had text-wrap balance/pretty, :focus-visible ring, prefers-reduced-motion — verified, nothing duplicated.
- VERIFICATION (real HTTP + browser):
  - Password endpoint: wrong-current 403 / short 422 / same-as-current 422 / anon 401; successful change → other session 401, current session 200, old password login 401, new password login 200.
  - Browser (agent-browser): form fill → submit → success notice "…any other device signed in to this account has been signed out", session survived. First attempt accidentally clicked the header Sign out (`button[type="submit"]` matches it first in DOM) — QA tooling lesson, not an app bug; redo with specific selector.
  - Audit trail shows two `password_changed` rows (actorRole tenant). Passwords reset back to QA_PASSWORD via scripts/qa-reset-password.mjs after testing (7 rows).
  - Landlord financials HTTP: totals {released 3,240,000, held 0, owed 0, commission 360,000} for Sarah — reconciles exactly with the known ledger (funded 3.6M = commission 360k + released 3.24M); tenant caller → 401.
  - /areas 200 desktop + mobile; districts grouped (Kampala: Ntinda 2, Bugolobi 1; Wakiso: Kira 1, Naalya 0 honest).
  - Mobile 412px: home, properties, detail, areas, security, how-it-works — zero horizontal overflow.
  - tsc 0 errors; ESLint clean; dev.log no new errors.

Stage Summary:
- Product now has: tenant/landlord password management with session-revocation semantics and audit; a landlord-facing earnings page whose every figure comes from the ledger; a public areas directory. All four role journeys still verified; nothing regressed.
- Remaining known gaps (unchanged from Task 8): real PSP + identity provider are mocks behind seams; API host + Vercel deployment unverified (external); photo upload intentionally officer-only; no rate limiting yet.
- Next-step recommendations: (1) tenant viewing cancellation flow if the service state machine allows it; (2) ops verification-queue page surfacing mandate submissions (the open half of F-003); (3) mobile polish pass on ops console tables; (4) before any deployment attempt, run scripts/journey-http.mjs equivalent against a provisioned API host.

---
Task ID: 10
Agent: main agent (branding round)
Task: Adopt the ORIGINAL company logo — derive favicon set, tagline and site description from it; restart the stopped webDevReview cron

Work Log:
- CRON RESTARTED: old job 423191 was present but stage="stopped" (why nothing fired). Deleted it, created fresh webDevReview job 423452, fixed_rate 900s, tz Africa/Nairobi, mandated description. Verified by list.
- SOURCE OF TRUTH: original 1254x1254 logo retrieved from the chat CDN to /tmp/hfr-logo-original.png (upload/ dir did not persist the file). scripts/build-brand-assets.py (PIL) dissects it: row-scan ink bands → house mark / HOUSE / FOR / RENT / tagline; white→alpha conversion (two-threshold ramp, autocrop, square pad).
- NEW ASSETS, all derived from the ORIGINAL artwork (replaces the previous low-quality dark-tile redraw whose tagline was garbled):
  - public/brand/house-for-rent-logo.png (trimmed full lockup, 798x944)
  - public/brand/mark-512.png + public/logo.png (64px transparent mark — header <Brand/> now uses the real mark on a white tile + hairline border so the black house survives dark mode, matching the favicon treatment)
  - public/favicon.ico (16/32/48 on white rounded tile), public/favicon.png (32), public/apple-touch-icon.png (180, white full-bleed)
  - public/brand/og-cover.png (1200x630, real lockup centred, nothing invented)
- COLOURS SAMPLED from the artwork (median): roof red #cb0108, house ink #0e1412, field green #0a5514. Tokens updated with documented rationale: --brand-action (and --accent via var) → #0a5514 (white on it ≈ 8.4:1, UP from 5.02:1 — WCAG AA margin improves); btn-primary hover now a step LIGHTER (#0d6519) since base is the deep end; --accent-soft/-line re-derived; NEW --brand-red: #cb0108. --brand-green #16a34a kept ONLY for on-dark marks (auth aside/CTA), as before. Dark-mode accent untouched.
- TAGLINE extracted verbatim from the logo: "Find your next home with ease." → src/app/ui.tsx exports TAGLINE (single source). Applied: footer brand block (uppercase, letterspaced, short red rule ::before echoing the logo's FOR rules — the logo red's one genuine interface job), auth-aside eyebrow ("HOUSE FOR RENT — FIND YOUR NEXT HOME WITH EASE." on the dark identity surface).
- SITE DESCRIPTION generated from tagline: layout metadata + home page metadata + OG description all lead with it. layout.tsx now sets metadataBase (NEXT_PUBLIC_SITE_URL env with localhost fallback), icons {ico, png, apple}, openGraph {siteName, og-cover 1200x630}. Rendered head verified via curl (og:image absolute URL resolves).
- About page "Operated by" card now shows the real lockup image (10rem) — the company's registered identity on the company page.
- Removed leftover EMPTY dirs src/app/about/ and src/app/contact/ (the real pages live in (site)/ — initially looked like dead footer links; verified 200s before touching anything).
- Verified by real HTTP + agent-browser: all 6 asset URLs 200 with correct content-types; head metadata correct; light+dark desktop and 412px mobile screenshots (header tile, footer tagline + red rule, deep-green primary buttons, about lockup, login eyebrow). tsc 0 errors, ESLint clean, dev.log zero errors. Dev server had died again (session env) — restarted detached, stable since.

Stage Summary:
- Brand identity now derives from the ORIGINAL logo file end-to-end: favicon set, header mark, about-page lockup, OG cover, tagline copy, and the two sampled colours. No fabricated claims introduced anywhere.
- Cron: job 423452 (every 15 min) LIVE — replaces stopped 423191.
- Next steps unchanged from Task 9 backlog (mandate submission route for real repo, ops bulk actions, neighbourhood admin), plus: when NEXT_PUBLIC_SITE_URL is known, set it so OG URLs are absolute in production.

---
Task ID: 11
Agent: cron webDevReview (autonomous round)
Task: Status assessment + QA, then two features: tenant viewing cancellation; finish the mandate UI (ops decision page + landlord submission)

Work Log:
- ASSESSMENT: server had died again (session env — restart pattern documented in Task 9). After restart: all 9 public routes 200, tsc 0, ESLint 0, dev.log 0 errors. Ops dispatch queue correctly drained (0 waiting), 1 officer with 1 assigned.
- FEATURE A — tenant viewing cancellation (backlog item 1 from Task 9; state machine already allowed requested/scheduled → cancelled):
  - src/server/viewings.ts: NotYourViewingError + cancelViewing() — ownership check, frozen-graph transition assert, status update + `viewing_cancelled` AuditEvent (actorRole tenant, detail carries from/listingId) in one transaction. nextStepFor gained a cancelled sentence.
  - HTTP: POST /api/v1/viewings/[id]/cancel (tenant role; service owns every rule). http.ts ALREADY had the NotYourViewingError→403 mapping pre-provisioned — the new class completes the circuit.
  - src/server/activity.ts: viewingEventLine was NOT side-aware (landlord feed read "You asked for a viewing…" — tenant voice). Now side-aware like dealEventLine, with proper landlord phrasings + cancelled lines ("You cancelled this viewing." / "This viewing was cancelled before the visit.").
  - UI: /account/viewings rows show a CancelViewingButton (two-step inline confirm: "Cancel this viewing? The landlord sees it as cancelled." → Yes/Keep) ONLY on requested|scheduled rows — the server's status decides; conducted/cancelled rows never grow the control. Confirm-step (not typed checkbox) because no money is at stake; error surfaced with API code.
  - REAL HTTP MATRIX (all as designed): anon 401 · wrong-tenant 403 NOT_YOUR_VIEWING · owner 200 cancelled · re-cancel 409 ILLEGAL_VIEWING_TRANSITION ("cancelled → cancelled is not permitted") · landlord role 403. Audit row verified in DB (actorRole=tenant, from=requested). Both activity feeds verified over HTTP with correct side phrasing.
  - BROWSER: full journey — request from property page → list shows Cancel button → two-step confirm → row flips to cancelled with server sentence. Mobile 412px: no overflow.
  - QA-tooling trap (recurring): `document.querySelector('form')` grabs the header SIGN-OUT form on portal pages — always target the specific form.
- FEATURE B — mandate UI completed (F-003 decision half; HTTP + service + adapter resolver all pre-existed, but src/app/ops/mandates/ was an EMPTY interrupted dir and no landlord submit surface existed):
  - ops: /ops/mandates page (state tabs pending/verified/rejected with shareable URLs, table: submitted/lister+tier/property/registered owner/submission note/decision; invalid ?state handled; AdminOnly fallback; honest empty states). mandate-actions.tsx client: Verify/Reject → confirm step with consequence sentence + optional decision note → POST /v1/admin/mandates/[id]/decision; 409 from a colleague's decision renders verbatim. Nav link added (admin only).
  - landlord: findForLister now returns mandateState per listing (one extra query, mapped per property; additive). Listing page renders MandatePanel ONLY when the server's blockedBy contains 'mandate' (property owners never see it; verified makes it disappear). Panel: no-mandate → submit with optional note; pending → "Awaiting verification"; rejected → "The last submission was rejected" + resubmit (service resets the same row to pending). POST /v1/landlord/mandates.
  - NEW QA tool: scripts/qa-set-lister-tier.mjs (F-009: refuses without QA_PASSWORD; refuses the two named demo landlords) because registration always creates property_owner and no tier surface exists yet.
  - FULL BROKER JOURNEY (real HTTP + browser): register +256700100098 → tier broker_agent → create 2 properties → blockedBy shows 'mandate' → submit via UI → "Awaiting verification" → admin queue shows row (lister+tier+property+owner) → Reject with note via UI → queue drains → Rejected tab has the row (submission note column; decision note deliberately audit-only) → landlord card flips to rejected + resubmit. First property: verified via HTTP → blockedBy drops 'mandate', mandateState=verified, card gone. Decision matrix: FOO 403 · invalid decision 422 INVALID_MANDATE_DECISION · admin 200 · re-decide 409 MANDATE_ALREADY_DECIDED. Audit rows mandate_submitted (lister) + mandate_decided (admin, note in payload) verified.
- STYLING DETAIL PASS: ops state tabs (aria-current + muted inactive), table-scroll verified scrollable at 412px with no page overflow; mandate card typography matches portal cards; cancel button stack right-aligned with the price column (span-carrying stack pattern from Task 9).
- Ops consoles redirect non-staff correctly (broker → /landlord on /ops/*).

Stage Summary:
- Tenant viewing cancellation is live end-to-end (service/HTTP/UI/activity/audit) and the landlord feed now speaks in the landlord's voice.
- The mandate flow (F-003 second half) is COMPLETE product surface: submit (landlord) → decide (ops) → resubmit loop, all server-authoritative, audit-carried, zero DB changes (mandateState on MyListing is additive JSON).
- Known gap found, deferred deliberately: no admin surface to SET a lister tier (registration is always property_owner) — the QA script bridges it for sandbox rounds; /ops/users tier management is the natural next feature.
- tsc 0 / ESLint 0 / dev.log 0 errors; demo data grew by: 2 QA listings + 2 mandates + 3 cancelled viewings (all labelled QA in landmark/identity where visible).
- Next steps: /ops/users tier management; ops viewing-detail cancel (landlord-reported case); journey-http script update to cover cancel + mandate endpoints; external items unchanged (PSP, identity provider, API host, Vercel).

---
Task ID: 12
Agent: cron webDevReview (autonomous round)
Task: Assessment + two admin/ops features: lister tier management (/ops/users) and operations viewing cancellation; fixed requested-viewing state lie on the ops detail page

Work Log:
- ASSESSMENT: server up (survived this time), 5 public routes 200, tsc 0, ESLint 0, dev.log 0 errors. Started from Task 11's deferred backlog.
- FEATURE A — lister tier management (closes the mandate story: how an account BECOMES a broker):
  - src/server/ops.ts: setListerTier({adminPartyId, partyId, tier}) — tier validated against LISTER_TIERS; account must be role 'lister' (else ListerTierNotApplicableError → 422 TIER_NOT_APPLICABLE); same-value submit is an idempotent no-op recording NOTHING; real changes write `lister_tier_changed` AuditEvent (actorRole admin, detail {from, to}) in the same transaction as the upsert. Rationale in code: tier gates the mandate requirement, so it is never self-declared at signup.
  - DirectoryRow gained listerTier (service + adapter type + resolveAdminUsers spreads it through).
  - HTTP: POST /v1/admin/users/[partyId]/tier (admin-only; invalid tier value → 422 VALIDATION with the allowed list in the message).
  - UI: /ops/users gained a "Lists as" column — landlord rows render TierControl (select + Set → confirm step stating the consequence per tier: owner = no mandate; broker/mgmt = every listing needs the owner's verified mandate), non-lister rows show an em-dash. Idempotent submit surfaces "That was already the tier — nothing changed."
  - VERIFIED (real HTTP): invalid tier 422 · tenant 422 TIER_NOT_APPLICABLE · FOO 403 · change 200 with previous returned · no-op changed:false · audit rows {from,to} with actorRole admin. BROWSER: full UI change broker_agent → property_mgmt_company → confirm → success notice + "Change again"; directory selects render per lister; mobile 412 table-scroll fine.
- FEATURE B — operations viewing cancellation (landlord-reported case):
  - src/server/viewings.ts: opsCancelViewing({viewingId, adminPartyId, note?}) — same frozen graph (requested/scheduled → cancelled; conducted 409s, evidence preserved), audit `viewing_cancelled` with actorRole admin + detail.by='operations' + note, so a tenant's and operations' cancellations stay distinguishable forever.
  - HTTP: POST /v1/ops/viewings/[viewingId]/cancel (admin-only, optional note).
  - COPY CORRECTNESS: tenant-side cancelled sentences were "You cancelled this viewing." — FALSE when operations cancels. Made neutral ("This viewing was cancelled.") in nextStepFor + activity feed, with comments; the actor distinction lives in the audit trail where it belongs.
  - UI: /ops/viewings/[id] renders an admin-only OpsCancelViewing card (confirm step + reason textarea for the audit) for requested|scheduled viewings. FIXED A STATE LIE on that page: `closed` was `status !== 'scheduled'`, so a REQUESTED viewing said "This visit closed without a report on file" and offered the field-report form + CloseVisit controls. Now closed = conducted|no_show|cancelled; requested shows "Not yet scheduled…" and the report/media/close sections explain themselves only for scheduled viewings.
  - Dispatch queue rows now link "open record" to the viewing detail — the path for admins to reach REQUESTED viewings (previously unreachable outside the queue card).
  - VERIFIED (real HTTP): ops cancel 200 with note · conducted 409 ILLEGAL_VIEWING_TRANSITION · FOO 403 · tenant feed neutral · audit admin row carries by='operations' + note, tenant rows do not. BROWSER: admin opened a requested record (all four gating assertions true), cancelled via UI with a landlord-called note, page flipped to cancelled pill + correct closed-state notes; queue link verified with a fresh requested viewing (left in queue as demo state).

Stage Summary:
- The tier → mandate → publish gate is now a closed operational loop with no QA-script dependency: ops sets tier → the mandate blocker appears on publish → landlord submits → ops decides → publish unlocks. Every state change audited.
- Operations can now take the landlord-reported cancellation through the real UI, and the ops console no longer lies about requested viewings.
- tsc 0 / ESLint 0 / dev.log 0 errors. Demo state: 1 requested viewing in dispatch (Grace, Bugolobi), QA broker tier back to broker_agent, tier-change audit rows present.
- Next: update scripts/journey-http.mjs to cover cancel + tier + mandate endpoints; consider /ops/users detail drawer (deeper than a table row); external items unchanged (real PSP, identity provider, API host, Vercel).
