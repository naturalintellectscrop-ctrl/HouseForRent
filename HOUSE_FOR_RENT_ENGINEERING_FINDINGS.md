# House For Rent — Engineering Findings Ledger

Persistent across sessions. Nothing is removed; findings move to
`RESOLVED` with the evidence that closed them.

**Established:** 2026-08-15, at commit `6274e38`.
**Method:** every route enumerated from controller decorators, then grepped
against actual call sites in `apps/console` and `apps/mobile`. Connectivity
is traced, not inferred from filenames.

---

## Summary

| Priority | Open | Resolved |
|---|---:|---:|
| P0 | 1 | 0 |
| P1 | 4 | 0 |
| P2 | 4 | 0 |
| P3 | 3 | 0 |

**The headline:** the backend is substantially more complete than the
surfaces. 24 of 54 routes have no caller in any client. Most consequentially,
**there is no way to create a deal through the API at all**, and no UI can
assign a viewing — so the tenant journey terminates at "viewing requested"
in the real product, even though it passes end-to-end in tests.

---

## F-001 — There is no create-deal endpoint; the money journey is unreachable

| | |
|---|---|
| **Priority** | **P0** |
| **Area** | API / Deals |
| **Status** | OPEN |

**Current behaviour.** `DealsController` exposes `GET /v1/deals`,
`GET /v1/deals/:dealId` and eleven transition endpoints. It exposes **no
`POST /v1/deals`**. `DealsService.createDeal()` exists and is called only
from test files.

**Expected behaviour.** A deal is created when a FOO matches an introduced
tenant to a listing. Some authorised path must reach `createDeal()`.

**Evidence.**
```
$ grep -nE "@Post\(\)" apps/api/src/deals/deals.controller.ts
  (no output)
$ grep -rn "prisma.deal.create\|deals.createDeal" apps/api/src --include=*.spec.ts | wc -l
  15
```
Every test constructs deals by writing to the database directly. The full
journey suite passes because its `journey()` helper calls
`prisma.deal.create(...)` between the viewing step and the funding step.

**Root cause.** Stage 3 built the state machine and Stage 8 wired the
journey *in tests*. The creation step was never given an endpoint, and the
integration test papered over it by writing directly — the exact pattern
§14 of the engineering protocol names as proving the database works rather
than the application.

**Files.** `apps/api/src/deals/deals.controller.ts`,
`apps/api/src/deals/deals.service.ts:createDeal`,
`apps/api/src/integration/full-journey.spec.ts`

**Impact.** DB: none. Backend: a reachable service method with no route.
Frontend: the tenant journey dead-ends after a viewing is conducted; no
rental can ever exist in production. Security: none directly — but note
that adding this endpoint requires care, since it names both parties and
the introduction record.

**Next action.** Add `POST /v1/deals` (`@Roles('foo','admin')`), taking
`listingId` + `introductionRecordId` and deriving both party IDs from the
introduction record server-side — never from the body. Then rewrite the
journey test to use it, which is what would have caught this.

---

## F-002 — No UI can assign a viewing, so dispatch never happens

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Console / Viewings |
| **Status** | OPEN |

**Current behaviour.** `POST /v1/viewings/:viewingId/assign` exists,
is admin-only, and is tested. **No client calls it.** The console's only
viewing screens are the officer's own board (`/v1/viewings/assigned/me`) and
a visit detail page.

**Expected behaviour.** An admin sees requested viewings and assigns an
officer, moving `requested → scheduled`.

**Evidence.** The console's grepped call list contains no `/assign`. There
is also no route that *lists* unassigned viewings — `assigned/me` is scoped
to the caller, so an admin cannot see the queue they are meant to dispatch
from.

**Root cause.** Stage 7 built the officer's surface; the dispatcher's
surface was never built, and the read endpoint it would need does not exist
either.

**Files.** `apps/api/src/viewings/viewings.controller.ts`,
`apps/console/app/(console)/`

**Impact.** Frontend: a tenant can request a viewing and nothing can ever
act on it. Combined with F-001 this severs the journey twice.

**Next action.** Add `GET /v1/viewings?status=requested` (admin) and a
console dispatch screen.

---

## F-003 — No surface can create a property or a listing

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Console + Mobile / Listings |
| **Status** | OPEN |

**Current behaviour.** `POST /v1/properties`, `POST /v1/listings`,
`POST /v1/listings/:id/publish` and `.../withdraw` all exist and are
tested. None is called by any client. The mobile landlord screen reads
`/v1/listings/mine` and can accept an agreement — it cannot create.

**Expected behaviour.** A landlord (or ops on their behalf) creates a
property and a listing.

**Evidence.** Neither client's call list contains `/v1/properties` or a
`POST /v1/listings`.

**Root cause.** Stage 5 built listings server-side and deliberately deferred
surfaces; the surfaces were then built read-only.

**Impact.** No inventory can enter the system except by seed script.

**Next action.** Decide the intended flow first — `DOMAIN.md` implies ops
creates listings during verification, in which case this belongs in the
console, not the landlord app.

---

## F-004 — Password reset is implemented server-side with no UI

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Auth / both surfaces |
| **Status** | OPEN |

**Current behaviour.** `POST /v1/auth/password-reset/request`, `/confirm`,
and `POST /v1/auth/password` exist and have 29 passing tests. No client
calls any of them. The mobile sign-in screen has no "forgot password" link.

**Expected behaviour.** A user who forgets their password can recover it.

**Root cause.** Shipped in the auth-hardening pass (`150080c`) as backend
only.

**Impact.** A locked-out user has no route back in.

**Note.** Delivery is also unsolved — no SMS provider is contracted, so the
token is currently returned in the response body under `devToken`
(suppressed in production). The UI cannot ship before delivery does.

---

## F-005 — Staff provisioning has no UI

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Console / Auth |
| **Status** | OPEN |

**Current behaviour.** `POST /v1/auth/staff` is admin-only and tested. No
caller. The only way to create the first admin is
`apps/api/seed-console-admin.mjs`, whose password is a known value in a
committed file.

**Impact.** Every FOO account must be created by running a script against
production.

**Next action.** Console screen under `/ops`. Also make the seed script
require a password argument rather than defaulting to a committed constant.

---

## F-006 — Device-session management has no UI

| | |
|---|---|
| **Priority** | P2 |
| **Area** | Mobile / Auth |
| **Status** | OPEN |

`GET /v1/auth/sessions` and `POST /v1/auth/logout-all` exist and are tested;
no caller. The account screen shows neither. The "3 devices signed out"
signal that makes logout-all worth having is therefore invisible.

---

## F-007 — Admin deal transitions have no UI

| | |
|---|---|
| **Priority** | P2 |
| **Area** | Console / Deals |
| **Status** | OPEN |

`earn-commission`, `settle`, `close`, `refund`, `dispute-hold`,
`resolve-dispute`, `match-tenant`, `sign-agreement` — eight admin/lister
transitions, all tested, none callable from any surface. `/ops/deals` shows
a distribution count only.

**Impact.** Settlement cannot be performed. Money can enter escrow (mobile
funds it) and never leave.

---

## F-008 — `GET /v1/listings/:id/field-confirmed` is superseded

| | |
|---|---|
| **Priority** | P3 |
| **Area** | API / Search |
| **Status** | OPEN — classify, do not delete yet |

Added in Stage 5. `GET /v1/listings/:id` (added for mobile) now returns the
same projection inside its payload, and mobile uses that. No caller for the
narrower route.

**Next action.** Confirm nothing external depends on it, then remove — or
keep deliberately as a cheap endpoint for a future widget and document why.

---

## F-009 — `seed-demo.mjs` and `seed-console-admin.mjs` ship committed passwords

| | |
|---|---|
| **Priority** | P2 |
| **Area** | Security / scripts |
| **Status** | OPEN |

Both scripts contain literal passwords (`demo-pass-1234`,
`console-demo-pass`) and are committed. `DEPLOYMENT.md` already warns to
change the admin password immediately after running it, which is mitigation
by documentation rather than by design.

**Next action.** Read the password from an environment variable and refuse
to run without one, mirroring how `JWT_SECRET` refuses to boot.

---

## F-010 — Better Auth is mounted but inert

| | |
|---|---|
| **Priority** | P3 |
| **Area** | Auth |
| **Status** | OPEN — deliberate, documented |

`/api/auth/*` is live and four `ba_` tables exist on Supabase. Nothing
trusts a Better Auth session. This is intentional and recorded in
`docs/AUTHENTICATION.md` §7 with the four steps required before cutover.
Listed here so it is not mistaken for an oversight.

---

## F-011 — The full-journey test bypasses the API it claims to prove

| | |
|---|---|
| **Priority** | P2 |
| **Area** | Tests |
| **Status** | OPEN |

`full-journey.spec.ts` opens with a comment stating "Nothing here calls a
service directly. If a step can only be reached by bypassing the API, then
the API does not implement the journey — which is exactly what this suite
exists to catch." It then creates deals with `prisma.deal.create()`.

The comment is right and the test does not honour it — which is why F-001
survived Stage 8.

**Next action.** Fix as part of F-001: once `POST /v1/deals` exists, the
helper uses it and the claim becomes true.

---

## Verification status

| Layer | Status |
|---|---|
| TypeScript (3 workspaces) | **VERIFIED** — all clean |
| API unit + integration | **VERIFIED** — 431/431 local |
| Money core vs Supabase | **VERIFIED** — 78/78 remote |
| Auth vs Supabase | **VERIFIED** — 29/29 remote |
| Full suite vs Supabase | **UNVERIFIED** — exceeds the 10-min tool limit; run manually |
| Console production build | **VERIFIED** — builds, 11 routes |
| Console in a browser | **VERIFIED** — 16/16 Playwright checks (earlier session) |
| Mobile bundle | **VERIFIED** — exports clean |
| Mobile on a device | **UNVERIFIED** — deferred at user's request |
| Vercel deployment | **UNVERIFIED** — not yet deployed |
| API deployment | **UNVERIFIED** — no host provisioned |
