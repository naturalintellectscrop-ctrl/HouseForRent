# House For Rent — Engineering Findings Ledger

Persistent across sessions. Nothing is removed; findings move to
`RESOLVED` with the evidence that closed them.

**Established:** 2026-08-15, at commit `6274e38`.
**Last updated:** 2026-08-24 — the web-first migration. F-013 superseded,
F-014 and F-015 closed, F-016 and F-017 opened and closed.
**Method:** every route enumerated from controller decorators, then grepped
against actual call sites in `apps/console` and `apps/mobile`. Connectivity
is traced, not inferred from filenames.

**Status vocabulary.** `IMPLEMENTED` — the code exists. `INTEGRATED` — a
caller exists and the path is connected. `VERIFIED` — the behaviour has been
demonstrated through the real authenticated path. `UNVERIFIED` — not yet
demonstrated. `BLOCKED` — an external dependency or a product decision
prevents it.

---

## Summary

| Priority | Open | Resolved |
|---|---:|---:|
| P0 | 0 | 2 |
| P1 | 1 | 5 |
| P2 | 3 | 2 |
| P3 | 3 | 0 |
| Superseded | — | 2 |

**Where it stands (2026-08-24).** The product is a **website**. The Expo
client has been removed and one Next.js application now carries the public
marketplace, the tenant and landlord portals, and the operations console.

The full journey is executable end to end **through HTTP by a real client**,
proven by `apps/api/scripts/journey-http.mjs` — which holds no database
connection, and therefore cannot pass by obtaining a state no user could
reach. That script is the direct answer to F-011, and running it is what
exposed F-014 and F-017 as still-live defects after both had been believed
either fixed or absent.

56/56 steps pass, including the financial invariants: an escrow of
3,600,000 funded, 1,200,000 commission recognised, 2,400,000 released, zero
outstanding, discharged.

What remains open is inventory-adjacent rather than journey-blocking:
brokers and management companies still cannot submit a mandate through any
route, so they cannot publish (F-003's remaining half).

---

---

## F-001 — There was no create-deal endpoint; the money journey was unreachable

| | |
|---|---|
| **Priority** | **P0** |
| **Area** | API / Deals |
| **Status** | **RESOLVED** — 2026-08-17 |

**What was wrong.** `DealsController` exposed `GET /v1/deals`,
`GET /v1/deals/:dealId` and eleven transition endpoints, and **no
`POST /v1/deals`**. `DealsService.createDeal()` existed and was called only
from test files. No rental could be created in the real product.

**Root cause.** Stage 3 built the state machine; Stage 8 wired the journey
*in tests*. The creation step was never given an endpoint, and the
integration test papered over it by writing to the database directly.

**What was done.**

`DealsService.createFromIntroduction()` and `POST /v1/deals`
(`@Roles('foo','admin')`). The request body has exactly one field,
`introductionRecordId`. Tenant, landlord and listing are all read
server-side from that record — the body has no field that could name a
party, so tampering is not defended against, it is unrepresentable.

Guards, all server-side:

| Check | Outcome |
|---|---|
| Introduction record exists | 404 `NOT_FOUND` |
| Caller is a FOO who is not the introducing officer | 403 `NOT_THE_INTRODUCING_OFFICER` |
| Caller is a tenant or lister | 403 (role matrix) |
| Viewing not `conducted` | 422 `VIEWING_NOT_CONDUCTED` |
| A non-terminal deal already exists for the record | 409 `DEAL_ALREADY_EXISTS` |
| Body names a party, a status or an amount | 400 (`forbidNonWhitelisted`) |

A **terminal** prior deal (cancelled / refunded / closed) deliberately does
**not** block: a deal cancelled before funding must not permanently bar the
same tenant and landlord from retrying off a meeting that already happened.
A funded deal does block — two open deals on one introduction could each be
funded, putting one tenant's money into two escrows for one room.

**What deliberately is NOT checked.** The listing's publication state. A
landlord who has agreed to let to this tenant may reasonably withdraw the
advert first; refusing then would strand a real let over a display flag.

**Verification.**

| Layer | Status |
|---|---|
| Implementation | `VERIFIED` — typecheck clean, 3 workspaces |
| Security | `VERIFIED` — 8 adversarial cases over HTTP |
| Tests | `VERIFIED` — `src/integration/create-deal.spec.ts`, 16/16 against real Supabase |
| Real journey | `VERIFIED` — `full-journey.spec.ts` now creates deals through the API; `dispatch.spec.ts` walks request → deal in one test |
| Real user action | `VERIFIED` — console: officer's visit page → **Open the deal** |

**Files.** `apps/api/src/deals/deals.service.ts`,
`apps/api/src/deals/deals.controller.ts`,
`apps/api/src/deals/dto/deal.dto.ts`,
`apps/api/src/common/domain-exception.filter.ts`,
`apps/api/src/integration/create-deal.spec.ts`,
`apps/console/app/actions/deals.ts`,
`apps/console/app/(console)/viewings/[viewingId]/open-deal.tsx`

---

## F-002 — No UI could assign a viewing, so dispatch never happened

| | |
|---|---|
| **Priority** | P1 |
| **Area** | API + Console / Viewings |
| **Status** | **RESOLVED** — 2026-08-17 |

**What was wrong.** `POST /v1/viewings/:viewingId/assign` existed, was
admin-only and was tested. No client called it — and no route *listed*
unassigned viewings, so a dispatcher could not see the queue they exist to
dispatch from. `requested` was a terminal state in the real product.

**Root cause.** Stage 7 built the officer's surface. The dispatcher's
surface was never built, and the read endpoint it needed did not exist
either — so the gap could not be closed by writing a screen alone.

**What was done.**

- `GET /v1/viewings/dispatch-queue` (`@Roles('admin')`). Returns a
  projection, not raw rows: each viewing carries its neighbourhood,
  `inServiceArea` and a server-computed `blockedBy`, because `assign()`
  refuses an out-of-corridor listing and a queue without that flag would
  offer a dispatcher rows guaranteed to be rejected.
- The same payload carries `officers` — active `foo` accounts with their
  current board count. A queue without the roster is not actionable: the
  dispatcher would have a viewing and no legal value for `fooPartyId`. The
  roster carries **no phone numbers** (NFR-3).
- Console `/ops/dispatch`, admin-only, one assign control per row, with the
  optional time change dispatch is entitled to make.
- Blocked rows are **shown, not filtered**. A tenant waiting on a property
  outside the corridor is a supply signal, not noise.

**Verification.**

| Layer | Status |
|---|---|
| Implementation | `VERIFIED` — typecheck clean; console builds, 12 routes |
| Security | `VERIFIED` — 401 / FOO 403 / tenant 403 / lister 403 / non-admin cannot assign / non-officer cannot be assigned / roster leaks no phone numbers |
| Tests | `VERIFIED` — `src/integration/dispatch.spec.ts`, 16/16 against real Supabase |
| Real journey | `VERIFIED` — request → queue → assign → board → report → conduct → introduction → deal, one test, all over HTTP |

**One test failed first, and it was the test's fault.** It tried to publish
an out-of-corridor listing, which `publish` correctly refuses — so an
out-of-corridor *request* cannot be created that way at all. The state can
only arise the way it would in production: the corridor is configurable
(FR-2.5), a neighbourhood is dropped from it, and viewings already requested
there are stranded. The test now models that, which is the case a dispatcher
actually needs to see.

**Files.** `apps/api/src/viewings/viewings.service.ts`,
`apps/api/src/viewings/viewings.controller.ts`,
`apps/api/src/integration/dispatch.spec.ts`,
`apps/console/app/(console)/ops/dispatch/`,
`apps/console/app/actions/viewings.ts`

---

## F-003 — No surface can create a property or a listing

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Console + Mobile / Listings |
| **Status** | OPEN — **decided 2026-08-17, not yet implemented** |

`POST /v1/properties`, `POST /v1/listings`, `POST /v1/listings/:id/publish`
and `.../withdraw` all exist and are tested. None is called by any client.
No inventory can enter the system except by seed script.

**What the SSOT already settles.** FR-2.1 is explicit: *"A lister MUST be
able to create a property and a listing."* FR-3.1: a listing must not become
publicly live until it has passed field verification. `publish` is
lister-callable and independently re-checks verification, corridor and
mandate server-side, so the lister cannot self-publish past the gates.

So the architecture is already the hybrid: **the lister authors, House For
Rent gates.** The open question was narrower than the original finding
implied — *where the authoring surface lives*.

### DECIDED — 2026-08-17

**Option C, the hybrid: the landlord authors in the mobile app; the field
officer's visit is the correction mechanism; publication stays
server-gated.**

Rationale as decided: it satisfies FR-2.1 literally, requires no new
listing endpoints (all four already exist and are tested), and scales past
the 25-listing launch gate in a way an ops-transcription model does not.
Landlord-entered data being rough until a visit happens is acceptable
precisely because the trust proposition is that a human goes and looks —
`submitFieldReport` already writes back `verificationState` and
`availabilityStatus`, so the correction path is built.

**Scope to build.**

| Surface | Calls |
|---|---|
| Mobile — create property | `POST /v1/properties` |
| Mobile — create listing | `POST /v1/listings` |
| Mobile — publish / withdraw | `POST /v1/listings/:id/publish`, `.../withdraw` |

No new API. The console keeps no authoring path in this option; if phone-in
landlords need one later it is additive.

### Coupled blocker — DECIDED: build alongside

`MandateService.submitMandate` / `decideMandate` have **no controller at
all** — no route, in any module. FR-3.2 requires a verified per-property
mandate before a broker or management company may publish, so today **only
`property_owner` listers can ever reach a live listing**; two of three
lister tiers are structurally blocked.

Decided: build it with F-003 rather than after. Without it, the hybrid
option above serves one tier out of three, and brokers would be able to
create listings they can never publish — a worse experience than not
letting them create at all.

**Scope to build.**

| Route | Actor |
|---|---|
| `POST /v1/properties/:id/mandate` | lister submits evidence |
| `POST /v1/mandates/:id/decide` | admin / FOO decides |

Plus one mobile submission form and one console decision queue. `publish()`
already calls `MandateService.canPublish()` and returns 422
`MANDATE_REQUIRED`, so nothing in the gate changes — it simply stops being
unsatisfiable.

---

## F-004 — Password reset is implemented server-side with no UI

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Auth / both surfaces |
| **Status** | OPEN — `BLOCKED` on SMS delivery |

`POST /v1/auth/password-reset/request`, `/confirm` and `POST /v1/auth/password`
exist with 29 passing tests. No client calls any of them; the mobile sign-in
screen has no "forgot password" link. A locked-out user has no route back in.

Delivery is unsolved — no SMS provider is contracted, so the token is
returned in the response body under `devToken` (suppressed in production).
**The UI cannot ship before delivery does**, which is why this stays open
rather than being built now.

---

## F-005 — Staff provisioning has no UI

| | |
|---|---|
| **Priority** | P1 |
| **Area** | Console / Auth |
| **Status** | OPEN |

`POST /v1/auth/staff` is admin-only and tested. No caller. The only way to
create the first admin is `apps/api/seed-console-admin.mjs`, whose password
is a known value in a committed file (see F-009).

**Newly sharpened by F-002.** The dispatch screen now renders an explicit
error when no active `foo` account exists, because in that state nothing in
the queue can be assigned. Dispatch works; it has no officers to dispatch
until staff provisioning has a surface. This is now a launch blocker rather
than an inconvenience.

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
no caller. The account screen shows neither, so the "3 devices signed out"
signal that makes logout-all worth having is invisible.

---

## F-007 — Admin deal transitions had no UI: money entered escrow and could not leave

| | |
|---|---|
| **Priority** | **P0** — raised from P2 on 2026-08-17 |
| **Area** | API + Console / Deals |
| **Status** | **RESOLVED** — 2026-08-17 |

**What was wrong.** `earn-commission`, `settle`, `close`, `refund`,
`dispute-hold`, `resolve-dispute`, `match-tenant` and `sign-agreement` were
all tested and none was callable from any client. `/ops/deals` showed a
distribution count only. The two transitions that DID have surfaces were the
two that put money **in**; every exit was missing, so client funds would
have been trapped from the first real transaction.

**Why it was raised to P0.** F-001 and F-002 made the money path reachable.
That sharpened this finding rather than reducing it.

**What was done.**

The load-bearing decision is that **the server decides what may be done**.

- `apps/api/src/deals/deal-actions.ts` — one descriptor per legal transition
  endpoint, and `availableDealActions()`, which filters by three independent
  conditions: the transition graph permits it, the caller's role appears in
  the handler's own `@Roles()` list, and any `@RequiresDealParty()`
  constraint holds.
- **The roles are not written down here.** They are read off the controller
  methods with `Reflector` at request time. Listing them in the table would
  be the exact duplication the table exists to prevent — the guard enforcing
  one list while the console rendered another, with nothing failing when
  they diverged.
- `GET /v1/deals/:dealId` now returns `property`, `parties`, `financial` and
  `availableActions` alongside the existing `deal` and `transitions`.
  Role-scoped, so the same endpoint serves the tenant's app and the console
  without either seeing the other's actions.
- `DealsService.financialSummary()` — every figure read from the ledger, the
  same rows reconciliation reads. Money leaves as strings.
- `GET /v1/admin/deals` gained `rows`. A distribution is a shape, not a
  queue: "3 deals at `commission_earned`" says three landlords are waiting
  to be paid and gives no way to reach any of them.
- Console `/ops/deals` (queue) and `/ops/deals/:dealId` (detail).

**The console holds no copy of the deal state machine.** It never asks what
the status is in order to decide what to offer — it renders
`availableActions`. One server action posts all eleven transitions, with no
per-action branch.

**Confirmation UX.** Money actions and irreversible actions require an
explicit tick whose text names the actual amount and states plainly whether
the action can be undone — *"Settle — pay the landlord. Amount involved:
UGX 3,000,000. This CANNOT be undone."* rather than "Are you sure?". It is a
mis-click safeguard, not a permission: the flag is stripped before the
request, and the server refuses an illegal transition whether or not it was
ticked.

**Concurrency.** The transition action re-fetches the deal **even when the
call fails**, because the likeliest rejection is a second operator having
acted on the same deal. A 409 `ILLEGAL_TRANSITION` is reported as such, next
to freshly-loaded server state. Nothing reports success on the console's own
authority.

**Verification.** See the session report for exact counts.

**Files.** `apps/api/src/deals/deal-actions.ts`,
`apps/api/src/deals/deals.service.ts`,
`apps/api/src/deals/deals.controller.ts`,
`apps/api/src/admin/admin.service.ts`,
`apps/api/src/integration/deal-operations.spec.ts`,
`apps/console/app/(console)/ops/deals/`,
`apps/console/app/actions/deals.ts`

---

## F-008 — `GET /v1/listings/:id/field-confirmed` is superseded

| | |
|---|---|
| **Priority** | P3 |
| **Area** | API / Search |
| **Status** | OPEN — classified **D (dead/obsolete)**, do not delete yet |

Added in Stage 5. `GET /v1/listings/:id` now returns the same projection
inside its payload, and mobile uses that. No caller for the narrower route.

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
`console-demo-pass`) and are committed. `DEPLOYMENT.md` warns to change the
admin password immediately after running it, which is mitigation by
documentation rather than by design.

**Next action.** Read the password from an environment variable and refuse
to run without one, mirroring how `JWT_SECRET` refuses to boot.

---

## F-010 — Better Auth is mounted but inert

| | |
|---|---|
| **Priority** | P3 |
| **Area** | Auth |
| **Status** | OPEN — deliberate, documented |

`/api/auth/*` is live and four `ba_` tables exist on Supabase. Nothing trusts
a Better Auth session. Intentional, recorded in `docs/AUTHENTICATION.md` §7
with the four steps required before cutover. Listed here so it is not
mistaken for an oversight.

---

## F-011 — The full-journey test bypassed the API it claimed to prove

| | |
|---|---|
| **Priority** | P2 |
| **Area** | Tests |
| **Status** | **RESOLVED** — 2026-08-17 |

`full-journey.spec.ts` opened with a comment stating *"Nothing here calls a
service directly. If a step can only be reached by bypassing the API, then
the API does not implement the journey — which is exactly what this suite
exists to catch."* It then created deals with `prisma.deal.create()`. The
comment was right; the test did not honour it, which is why F-001 survived
Stage 8 with a fully green suite.

**What was done.** The `journey()` helper now calls `POST /v1/deals` as the
introducing officer and asserts the response's parties against the fixture.
The request carries no tenant, no landlord and no listing — so if the server
ever stopped deriving them, the journey could not supply them and would fail
rather than quietly proving a weaker property.

---

## F-012 — Three caller-supplied money amounts are reconciled against nothing

| | |
|---|---|
| **Priority** | **P1** |
| **Area** | Money core / Deals + Ledger |
| **Status** | OPEN — **CONFIRMED** by test against real Postgres, 2026-08-17 |

**What was found.** The *sequencing* guarantees are structural and proven:
no `escrow_funded → settled` edge, no `escrow_funded → cancelled` edge,
double-entry postings, database-level immutability. None of that constrains
the FIGURES. Three amounts come from a caller and are compared to nothing:

| Amount | Supplied by | Compared against |
|---|---|---|
| `fund-escrow.amount` | the tenant | nothing — not the listing's own `monthlyRent × requiredMonthsUpfront + depositAmount` |
| `settle.totalHeld` | an admin | nothing — not the ledger's `escrow_liability` balance |
| `refund.amount` | an admin | nothing — not what was funded |

**Why the green suite cannot catch it.** `LedgerService.everyPostingBalances()`
asserts that each posting nets to zero. A *wrong* amount balances exactly as
perfectly as a right one, so the system's own integrity check is
structurally blind to this class of error. `internallyConsistent` in the
reconciliation report is the same check and is equally blind.

**Impact.** A mistyped `totalHeld` at settlement instructs the custodian to
release money that was never received and leaves `escrow_liability` non-zero
on a deal the system reports as `settled`. This is a fat-finger risk before
it is an attack surface — and F-007 means the transition has no UI yet, so
the fix can land before the first operator ever performs one.

**Evidence.** `apps/api/src/integration/escrow-amount-integrity.spec.ts`,
**6/6 passing against real Supabase**. Read that the right way round: these
tests DOCUMENT ACTUAL BEHAVIOUR rather than asserting preferred behaviour,
so **their passing is the confirmation of the defect**, not of correctness.
A test rewritten to assert the behaviour we would prefer would have failed,
and hidden what it was written to find.

Confirmed concretely, all over HTTP:

| Probe | Result |
|---|---|
| Tenant funds **1 shilling** against a listing asking 4,000,000 | Accepted; deal reaches `escrow_funded` |
| Admin settles `totalHeld` = **10× what was ever funded** | Accepted; `escrow_liability` left non-zero on a `settled` deal |
| Admin refunds **3× what was funded** | Accepted |
| `everyPostingBalances()` after each | **`true`** — the integrity check cannot see any of it |

Three guarantees were re-confirmed as genuinely structural in the same run,
which is why the failure is confined to amounts rather than sequencing: a
funded deal still cannot be settled (409), still cannot be cancelled (409),
and commission is still computed from the snapshot rather than from what was
funded — under-funding does not shrink the commission.

**Next action — recommended, not yet implemented.** This changes money
semantics and deserves the same deliberate treatment as the rest of the
core, so it is recorded rather than patched in passing:

1. `fundEscrow` compares the amount against the listing's own terms and
   rejects a shortfall (422), or accepts partial funding *deliberately* and
   records the expected total on the deal.
2. `settle` derives `totalHeld` from the ledger's `escrow_liability` balance
   instead of accepting it, removing the parameter entirely.
3. `refund` does the same.
4. A ledger-level invariant that no account of type `escrow_liability` may
   hold a debit balance — the check `everyPostingBalances` cannot make.

---

## F-013 — The mobile deal screen holds its own copy of the state machine

| | |
|---|---|
| **Priority** | P2 |
| **Area** | Mobile / Deals |
| **Status** | OPEN — found while building F-007 |

`apps/mobile/app/(app)/deal/[id].tsx` decides what to offer with literal
status comparisons:

```tsx
{isTenant && deal.status === 'agreement_signed' && ( …pay into escrow… )}
{isTenant && deal.status === 'escrow_funded'    && ( …confirm move-in… )}
{!isTenant && deal.status === 'tenant_matched'  && ( …sign the agreement… )}
```

That is a second copy of the transition graph and of the role matrix, living
in a React Native component. It happens to be correct today. It is free to
drift, and the drift is silent in both directions: offering an action the
server refuses is merely annoying, but *hiding* an action the server would
have allowed is invisible — nobody files a bug about a button they never
saw.

**Not a defect in behaviour today.** Logged because F-007 built the fix and
did not apply it here: `GET /v1/deals/:dealId` now returns
`availableActions`, already role-scoped, so the tenant's app receives
exactly the tenant's actions. The screen can render that list the way the
console does.

**Next action.** Replace the three status comparisons with a render of
`availableActions`. Out of scope for F-007, which was the operations
console; in scope for whoever next touches the mobile deal screen.

---

## F-014 — `sign-agreement` was offered but could not be completed

| | |
|---|---|
| **Priority** | P1 |
| **Area** | API / Deals |
| **Status** | **RESOLVED** — 2026-08-24 |

`POST /v1/deals/:dealId/sign-agreement` required `agreementId`, and **no
route returned one.** There is no endpoint that lists a listing's
agreements; the id existed only in the database and in test fixtures. The
one transition that freezes the commission snapshot — the point at which the
landlord's rate becomes immutable — was unreachable from any real surface.

The server offered it in `availableActions`, so a correctly-written thin
client rendered a button that could not succeed.

**Resolution.** `agreementId` is now **optional and derived**. A listing
cannot be published without exactly one accepted agreement (the publish gate
enforces that), and a deal is created from an introduction on one listing —
so the server looks it up rather than asking a client to know something it
cannot know.

It remains *accepted* but optional, for the operations console: an admin
acting on a listing with more than one accepted agreement in its history can
name which. **A supplied id is scoped to the deal's own listing in both
branches** — an id belonging to another listing is refused rather than
honoured, because honouring it would freeze a different landlord's
commission terms onto this deal.

**Evidence.** `journey-http.mjs` calls `sign-agreement` with an empty body
and the deal reaches `agreement_signed`; the run then funds, confirms
move-in, earns commission, settles and closes with a balanced ledger.

---

## F-015 — Neighbourhoods can only be created by writing to the database

| | |
|---|---|
| **Priority** | P1 |
| **Area** | API / Listings |
| **Status** | **RESOLVED** — 2026-08-24 |

`POST /v1/properties` requires `neighbourhoodId`. There is **no route that
creates a neighbourhood, and none that lists them.** `GET /v1/listings`
accepts a `neighbourhoodId` filter, so a client is expected to know ids it
has no way to discover.

Every test and seed script creates them with `prisma.neighbourhood.create`.

**Impact.** Blocks F-003 directly: a landlord authoring a property needs a
neighbourhood picker, and taxonomy-first location is not a detail — FR-2.2
makes the neighbourhood the primary location field and forbids requiring a
street address. It also means no end-to-end scenario can be seeded through
the API alone.

**Resolution.** `src/taxonomy/` — `GET /v1/neighbourhoods` and
`GET /v1/amenities` are **public**, because the taxonomy IS the search
vocabulary (FR-2.2) and a filter whose values cannot be discovered is not a
filter. `POST /v1/neighbourhoods` and `POST /v1/neighbourhoods/:id/service-area`
are **admin-only**: `inServiceArea` decides what the public feed may
contain, so a lister able to mint an in-service neighbourhood would have
routed around corridor scoping entirely. Both writes emit audit events.

The listing defaults to the service area only — a neighbourhood outside the
corridor can never carry a live listing, so offering one in a picker sets a
landlord up to publish into a void.

`liveListingCount` applies the same predicate the search does, **freshness
included**. The first implementation omitted the freshness filter and
advertised 16 homes across areas whose search returned 12; a count that
disagrees with the page it links to is a small dishonesty on a surface whose
whole job is being believed.

**Evidence.** `journey-http.mjs` obtains a `neighbourhoodId` from
`GET /v1/neighbourhoods` and creates a property with it, holding no database
connection. The landlord Playwright spec asserts the picker has more than
one option — before this it could have had none.

---

## F-016 — `@Roles('lister')` was being read as ownership

| | |
|---|---|
| **Priority** | **P0** |
| **Area** | API / Listings — authorisation |
| **Status** | **RESOLVED** — found and fixed 2026-08-24 |

API Spec §4.2 has always footnoted `POST /listings`, `publish`,
`withdraw` and `agreement/accept` with "¹ and must be the lister who owns
that listing". For the first three it was **not implemented**. The handlers
carried `@Roles('lister', 'admin')` and nothing else, and neither
`createListing` nor `publish` nor `withdraw` looked at who owned the
property.

**Impact.** Any registered lister — an account anyone can self-serve in
under a minute — could, knowing only an id:

- publish terms against a stranger's property, which a landlord would
  discover when a tenant arrived;
- **withdraw a competitor's live listing from the marketplace.**

Ids are not secret: every listing id is in a public URL.

**Why it survived.** Role membership and ownership are answered by the same
English word ("is this caller a landlord?" / "is this caller THIS
landlord?"), and the failure mode is silent — an endpoint written without
the check looks identical to one written with it, and works correctly for
the owner. Every test had the owner call it.

**Resolution.** `ListingsService.assertOwnsListing()` and
`assertOwnsProperty()`, called on every lister-callable mutation including
photo upload and removal. **403 `NOT_THE_PROPERTY_OWNER`**, not 404: the
caller already holds the role and already possesses the id, so hiding the
resource conceals nothing and would deny a landlord who mistyped their own
id the real reason. Admin is exempt — operations legitimately author on a
landlord's behalf, and every such act is already attributable.

Deliberately **not** a guard decorator: a guard is opt-in, and opt-in is
exactly how this was missed four times.

**Evidence.** `journey-http.mjs` registers a second landlord and asserts
403 on withdrawing another owner's live listing, on listing against their
property, and on uploading a photograph to their listing.

---

## F-017 — no client could make a tenant identity-verified

| | |
|---|---|
| **Priority** | **P0** |
| **Area** | API / Screening |
| **Status** | **RESOLVED** — found and fixed 2026-08-24 |

`POST /v1/viewings` refuses an unverified tenant with 422
`TENANT_NOT_VERIFIED` (FR-5.1), and that rule is correct. But
**`ScreeningModule` registered no controller.** `OnboardingService`,
`IdentityService.recordConsent`, `verifyNin`, `verifyPhone` and
`verifySelfieMatch` all existed, were unit-tested, and were reachable from
nothing but spec files and seed scripts writing to Prisma directly.

**Impact.** The tenant journey ended at registration **for every real
user**. Not degraded — ended. A tenant could register, browse, open a
property, press "request a viewing", and be refused, with no route anywhere
in the API that would have changed that.

**Why it survived, and why this is the same defect as F-011.** Every test
and both seed scripts granted verification by writing `identity_verification`
rows directly. The suite was green because it obtained through the database
a state no client could obtain. This is the fourth instance of that exact
pattern (F-001, F-002, F-007, F-017): the service is complete, the tests
pass, and the product does not work.

**Resolution.** `src/screening/screening.controller.ts` —
`GET /v1/identity/me`, `POST /v1/identity/consent`, `POST /v1/identity/verify`,
`POST /v1/identity/screen`. The subject is always the caller; no endpoint
accepts a party id. Consent is a separate call made first, and
`IdentityService` independently refuses to verify a party without a consent
record, so the DPA-2019 ordering is enforced rather than merely intended.

The NIN and phone cross the `IdentityProvider` boundary and are never
persisted. **V1 runs a mock provider, and the web page that calls this says
so** — it does not show a government crest or claim a register was
consulted. A product selling verification cannot be the thing that
overstates its own.

**Evidence.** `journey-http.mjs` registers a fresh tenant, asserts
`identityVerified: false`, asserts the viewing request is refused with 422,
then verifies through HTTP and completes the viewing. The tenant Playwright
spec drives the same sequence through the browser.

---

## F-013 — mobile deal screen held its own copy of the state machine

**SUPERSEDED — 2026-08-24.** The Expo client was removed. The web client
renders the server's `availableActions` and contains no status→action map;
the one status table it holds (`DEAL_TRAIL` in `lib/portal.ts`) is a display
ORDER for a progress bar and is never consulted to decide whether an action
is permitted.

Recorded as superseded rather than resolved: the defect was not fixed, the
code containing it no longer exists.

---

## F-008 — `GET /v1/listings/:id/field-confirmed` is superseded

Unchanged. The route still exists; `GET /v1/listings/:id` returns the same
projection inline, which is what the web client uses.

---

## Verification status

Recorded 2026-08-24, against the hosted Supabase instance.

| Layer | Status |
|---|---|
| TypeScript — `@hfr/api` | **VERIFIED** — clean |
| TypeScript — `@hfr/web` | **VERIFIED** — clean |
| Web production build | **VERIFIED** — 32 routes |
| **Full journey over HTTP** (`scripts/journey-http.mjs`) | **VERIFIED** — 56/56 steps, 0 failures, no database connection held |
| Financial invariants at close | **VERIFIED** — funded 3,600,000 · commission 1,200,000 · released 2,400,000 · escrow 0 · discharged |
| F-012 (caller-supplied amount) | **VERIFIED still closed** — `fund-escrow` with a wrong amount returns 422 `AMOUNT_NOT_AUTHORITATIVE` *while the deal is otherwise ready to fund*, so the refusal is about the figure and not the transition |
| Authorisation refusals | **VERIFIED** — 11 assertions: unauthenticated, cross-role, non-party (404), and three F-016 ownership refusals |
| Browser journeys, desktop 1440px | **VERIFIED** — 8/8 Playwright specs |
| Browser journeys, phone 412px | **VERIFIED** — 4/4 Playwright specs, including no horizontal overflow on any public page |
| API unit + integration suite | **UNVERIFIED since the web migration** — exceeds the tool timeout; run manually. The list/read contracts widened (`findForTenant`, `findForParty`), so specs asserting the old bare-row shapes are expected to need updating |
| Vercel deployment | **UNVERIFIED** — not yet deployed |
| API deployment | **UNVERIFIED** — no host provisioned |
| Photograph persistence across redeploy | **UNVERIFIED** — needs a persistent disk; see DEPLOYMENT.md §2.3 |

### Known open items

| Item | Note |
|---|---|
| Mandate submission has no route | Brokers and management companies cannot publish. The remaining half of F-003 |
| API spec suite not re-run | See above — a known consequence of widening two read contracts, not a suspected regression |
| Identity provider is a mock | Behind `IdentityProvider`. Every surface that calls it says so |
| PSP is a mock | Behind `PaymentProvider`. The ledger behaves correctly regardless |
| Photographs on the demo corridor are generated fixtures | Marked `development_fixture` by the API and labelled on the image itself |
