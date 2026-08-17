# House For Rent — Connectivity Matrix

Traced by enumerating controller routes and grepping actual call sites in
`apps/console` and `apps/mobile`. Nothing here is inferred from a filename.

**First traced** at commit `6274e38`. **Updated 2026-08-17** after F-001 and
F-002.

**Status meanings**

| Status | Means |
|---|---|
| `LIVE` | DB → service → API → auth → client → user outcome, all present, exercised |
| `VERIFIED` | as above, and proven by a test that goes through the API |
| `PARTIALLY_CONNECTED` | some links present, journey incomplete |
| `INERT` | backend complete and tested, **no client calls it** |
| `ORPHANED` | superseded; no caller and no plan |
| `BROKEN` | present but fails |
| `BLOCKED` | waiting on an external dependency |
| `UNKNOWN` | not yet traced |

---

## The headline number

**23 of 56 routes have no client caller** (was 24 of 54).

That the count barely moved is the honest reading. Two routes were added and
one previously-inert route was connected, so the *arithmetic* is nearly
unchanged. What changed is which links were missing: the two breaks that
severed the tenant journey in the middle are closed, and the remaining
disconnection is concentrated in one place — the operator surfaces for money
(F-007) and for inventory (F-003).

---

## Tenant journey

| Feature | DB | Service | API | Auth | Client | Journey | Real outcome | Status |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| Register (tenant) | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Account created | `VERIFIED` |
| Sign in | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Session issued | `VERIFIED` |
| Session refresh / rotation | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Rotated, old spent | `VERIFIED` |
| Browse listings | ✅ | ✅ | ✅ | public | ✅ mobile | ✅ | Verified feed | `VERIFIED` |
| Listing detail | ✅ | ✅ | ✅ | public | ✅ mobile | ✅ | Terms + field report | `VERIFIED` |
| Request a viewing | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | `viewing.requested` | `VERIFIED` |
| **Viewing gets assigned** | ✅ | ✅ | ✅ | ✅ | ✅ **console** | ✅ | `requested → scheduled`, tenant sees it | **`VERIFIED`** — F-002 closed |
| See own viewings | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Status list | `VERIFIED` |
| **A deal is created** | ✅ | ✅ | ✅ **new** | ✅ | ✅ **console** | ✅ | Parties derived from the introduction | **`VERIFIED`** — F-001 closed |
| See own deals | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Now genuinely populated | `VERIFIED` |
| Fund escrow | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Liability up, no revenue | `VERIFIED` |
| Confirm move-in | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Unlocks the earn step | `VERIFIED` |
| **Get the money back / see it settle** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | **Funds cannot leave escrow** | **`INERT`** — F-007 (P0) |
| Password reset | ✅ | ✅ | ✅ | public | ❌ **none** | ❌ | No way back in | **`INERT`** — F-004, `BLOCKED` on SMS |
| Manage devices | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | — | **`INERT`** — F-006 |

---

## Landlord / lister journey

| Feature | DB | Service | API | Auth | Client | Journey | Real outcome | Status |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| Register (lister) | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Account created | `VERIFIED` |
| See own listings | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | With `blockedBy` | `VERIFIED` |
| **Create a property** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Seed script only | **`INERT`** — F-003 |
| **Create a listing** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Seed script only | **`INERT`** — F-003 |
| View agreement terms | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Commission in shillings | `VERIFIED` |
| Accept the agreement | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Immutable row + audit | `VERIFIED` |
| **Publish / withdraw** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | — | **`INERT`** — F-003 |
| **Submit a mandate** (broker / mgmt co.) | ✅ | ✅ | ❌ **no route** | — | ❌ | ❌ | Two of three lister tiers can never publish | **`BROKEN`** — F-003 |
| **Sign the deal agreement** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Deal stalls at `tenant_matched` | **`INERT`** — F-007 |

---

## Field officer (FOO) journey

| Feature | DB | Service | API | Auth | Client | Journey | Real outcome | Status |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| Sign in | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Session | `VERIFIED` |
| Dispatch board | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | **Now populated — dispatch feeds it** | `VERIFIED` |
| Visit detail | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | With `whatIsMissing` | `VERIFIED` |
| File field report | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Writes back freshness + verification | `VERIFIED` |
| Capture media | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Ladder enforced | `VERIFIED` |
| Conduct viewing | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Introduction record, DB-enforced | `VERIFIED` |
| Mark no-show | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Tracked | `VERIFIED` |
| **Open the deal** | ✅ | ✅ | ✅ **new** | ✅ | ✅ **console** | ✅ | Deal created from the introduction | **`VERIFIED`** — F-001 |
| **Verify a listing** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ⚠️ | Only via the field-report side-effect | `PARTIALLY_CONNECTED` |
| **Confirm availability** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ⚠️ | Same | `PARTIALLY_CONNECTED` |

---

## Admin journey

| Feature | DB | Service | API | Auth | Client | Journey | Real outcome | Status |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| Launch gate | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Hero + meter | `VERIFIED` |
| Verification queue | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | With `blockedBy` | `VERIFIED` |
| Reconciliation | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Ledger vs custodian | `VERIFIED` |
| Deal-state distribution | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Bar list | `VERIFIED` |
| Audit trail | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | By subject | `VERIFIED` |
| Config versions | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Create + history | `VERIFIED` |
| Commission rate versions | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | New version only | `VERIFIED` |
| Introduction evidence | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Queryable | `VERIFIED` |
| **See the dispatch queue** | ✅ | ✅ | ✅ **new** | ✅ | ✅ **console** | ✅ | Waiting viewings + officer roster | **`VERIFIED`** — F-002 |
| **Assign a viewing** | ✅ | ✅ | ✅ | ✅ | ✅ **console** | ✅ | Officer dispatched | **`VERIFIED`** — F-002 |
| **Provision staff** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Script only — and dispatch needs officers | **`INERT`** — F-005 |
| **Settle / refund / close** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Money cannot leave escrow | **`INERT`** — F-007 (P0) |
| **Decide a mandate** | ✅ | ✅ | ❌ no route | — | ❌ | ❌ | `MandateService` has no controller | **`BROKEN`** — F-003 |

---

## Cross-cutting

| Concern | Status | Note |
|---|---|---|
| Role authorisation (§4 matrix) | `VERIFIED` | 132 assertions, both halves, proven load-bearing |
| Deal-party isolation (404 not 403) | `VERIFIED` | Tested |
| Assigned-FOO isolation | `VERIFIED` | Proven load-bearing — disabling it failed exactly 3 |
| Introducing-officer isolation | `VERIFIED` | New with F-001 — one officer cannot open deals off another's visits |
| Account states | `VERIFIED` | 29 tests; enforced at login, refresh, resolveCaller |
| Ledger double-entry + immutability | `VERIFIED` | DB triggers, 78/78 against real Postgres |
| **Ledger AMOUNT correctness** | **`BROKEN`** | F-012 — **confirmed by test**: a 1-shilling funding, a 10× settlement and a 3× refund were all accepted, and `everyPostingBalances()` returned `true` after each |
| Move-In Guarantee | `VERIFIED` | Structural — the edge does not exist in the graph |
| Audit log (NFR-2) | `VERIFIED` | Money, verification, consent, config |
| Money as integer shillings | `VERIFIED` | bigint throughout; strings at the boundary |
| Media storage | `BLOCKED` | Interface + mock; provider procurement-gated |
| PSP | `BLOCKED` | Interface + mock; procurement-gated |
| NIN / liveness | `BLOCKED` | Interface + mock; procurement-gated |
| SMS delivery | `BLOCKED` | No provider; blocks F-004 |
| Rate limiting | `INERT` | Not implemented; belongs at the edge |

---

## The 23 routes with no client caller, classified

Per the Phase 6 taxonomy.

### A — Intentionally backend-only (1)

| Route | Note |
|---|---|
| `GET /` | Health check. Called by the platform, not a client. |

### B — Missing UI, backend capability exists (19)

| Route | Blocked by |
|---|---|
| `POST /v1/deals/:id/match-tenant` | F-007 |
| `POST /v1/deals/:id/sign-agreement` | F-007 |
| `POST /v1/deals/:id/earn-commission` | F-007 |
| `POST /v1/deals/:id/settle` | F-007 |
| `POST /v1/deals/:id/close` | F-007 |
| `POST /v1/deals/:id/refund` | F-007 |
| `POST /v1/deals/:id/cancel` | F-007 |
| `POST /v1/deals/:id/dispute-hold` | F-007 |
| `POST /v1/deals/:id/resolve-dispute` | F-007 |
| `POST /v1/properties` | F-003 |
| `POST /v1/listings` | F-003 |
| `POST /v1/listings/:id/publish` | F-003 |
| `POST /v1/listings/:id/withdraw` | F-003 |
| `POST /v1/listings/:id/verify` | partially covered by the field-report side-effect |
| `POST /v1/listings/:id/confirm-availability` | same |
| `POST /v1/auth/staff` | F-005 |
| `GET /v1/auth/sessions` | F-006 |
| `POST /v1/auth/logout-all` | F-006 |
| `POST /v1/auth/password` | F-004 |

### C — Missing API, no backend bridge (2 capabilities)

| Capability | Note |
|---|---|
| Submit a property mandate | `MandateService.submitMandate` has no controller. **Blocks two of three lister tiers from ever publishing** (FR-3.2). |
| Decide a property mandate | `MandateService.decideMandate` has no controller. |

### D — Dead / obsolete (1)

| Route | Note |
|---|---|
| `GET /v1/listings/:id/field-confirmed` | F-008. Superseded by `GET /v1/listings/:id`. Not deleted — classification first. |

### E — Security-sensitive, needs further authorisation review (2)

| Route | Note |
|---|---|
| `POST /v1/auth/password-reset/request` | F-004. `BLOCKED` on SMS delivery; `devToken` in the response body must stay production-suppressed. |
| `POST /v1/auth/password-reset/confirm` | Same. |

### F — Product decision required (0 remaining)

F-003 — **where the listing-authoring surface lives** — was decided on
2026-08-17: the hybrid, with the landlord authoring in the mobile app, the
field officer's visit as the correction mechanism, and publication
server-gated. The mandate routes are to be built alongside it. No route was
ever waiting on this; the decision determines which client calls the ones
that already exist.

---

## Where the journey now breaks

Before this session it broke twice, at assignment and at deal creation, and
a tenant could get no further than "viewing requested".

It now runs unbroken from registration to **funded escrow**:

```
register → browse → listing detail → request viewing
  → dispatch queue → assign → officer's board
  → field report → conduct → introduction record
  → open the deal → match tenant → sign agreement → fund escrow
  → confirm move-in
```

with two caveats that are not cosmetic:

1. `match-tenant` and `sign-agreement` have **no UI** (F-007). They are
   reachable over HTTP and proven by test, but no operator or landlord can
   perform them in the product.
2. Nothing after `move_in_confirmed` has a surface at all. **Money enters
   escrow and cannot leave.** That is now the single most consequential
   remaining break, which is why F-007 was raised to P0.

And nothing can enter the system at the top: no surface creates a property
or a listing (F-003), and brokers and management companies cannot publish at
all because mandate submission has no route.
