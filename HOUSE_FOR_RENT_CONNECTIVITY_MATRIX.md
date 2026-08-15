# House For Rent — Connectivity Matrix

Traced at commit `6274e38` by enumerating controller routes and grepping
actual call sites in `apps/console` and `apps/mobile`. Nothing here is
inferred from a filename.

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

## Tenant journey

| Feature | DB | Service | API | Auth | Client | Journey | Real outcome | Status |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| Register (tenant) | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Account created | `VERIFIED` |
| Sign in | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Session issued | `VERIFIED` |
| Session refresh / rotation | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Rotated, old spent | `VERIFIED` |
| Browse listings | ✅ | ✅ | ✅ | public | ✅ mobile | ✅ | Verified feed | `VERIFIED` |
| Listing detail | ✅ | ✅ | ✅ | public | ✅ mobile | ✅ | Terms + field report | `VERIFIED` |
| Request a viewing | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | `viewing.requested` | `VERIFIED` |
| **Viewing gets assigned** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Never leaves `requested` | **`INERT`** — F-002 |
| See own viewings | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ✅ | Status list | `VERIFIED` |
| **A deal is created** | ✅ | ✅ | ❌ **no route** | — | ❌ | ❌ | Impossible via API | **`BROKEN`** — F-001 |
| See own deals | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ⚠️ | Empty in practice | `PARTIALLY_CONNECTED` |
| Fund escrow | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ⚠️ | Unreachable — needs a deal | `PARTIALLY_CONNECTED` |
| Confirm move-in | ✅ | ✅ | ✅ | ✅ | ✅ mobile | ⚠️ | Same | `PARTIALLY_CONNECTED` |
| Password reset | ✅ | ✅ | ✅ | public | ❌ **none** | ❌ | No way back in | **`INERT`** — F-004 |
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
| Sign deal agreement | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | — | **`INERT`** — F-007 |

---

## Field officer (FOO) journey

| Feature | DB | Service | API | Auth | Client | Journey | Real outcome | Status |
|---|:--:|:--:|:--:|:--:|:--:|:--:|---|---|
| Sign in | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Session | `VERIFIED` |
| Dispatch board | ✅ | ✅ | ✅ | ✅ | ✅ console | ⚠️ | Always empty — nothing assigns | `PARTIALLY_CONNECTED` |
| Visit detail | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | With `whatIsMissing` | `VERIFIED` |
| File field report | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Writes back freshness + verification | `VERIFIED` |
| Capture media | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Ladder enforced | `VERIFIED` |
| Conduct viewing | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Introduction record, DB-enforced | `VERIFIED` |
| Mark no-show | ✅ | ✅ | ✅ | ✅ | ✅ console | ✅ | Tracked | `VERIFIED` |
| **Verify a listing** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ⚠️ | Only via field report side-effect | `PARTIALLY_CONNECTED` |
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
| **Assign a viewing** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | — | **`INERT`** — F-002 |
| **Provision staff** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Script only | **`INERT`** — F-005 |
| **Settle / refund / close** | ✅ | ✅ | ✅ | ✅ | ❌ **none** | ❌ | Money cannot leave escrow | **`INERT`** — F-007 |
| **Decide a mandate** | ✅ | ✅ | ❌ no route | — | ❌ | ❌ | `MandateService` has no controller | **`INERT`** |

---

## Cross-cutting

| Concern | Status | Note |
|---|---|---|
| Role authorisation (§4 matrix) | `VERIFIED` | 132 assertions, both halves, proven load-bearing |
| Deal-party isolation (404 not 403) | `VERIFIED` | Tested |
| Assigned-FOO isolation | `VERIFIED` | Proven load-bearing — disabling it failed exactly 3 |
| Account states | `VERIFIED` | 29 tests; enforced at login, refresh, resolveCaller |
| Ledger double-entry + immutability | `VERIFIED` | DB triggers, 78/78 against real Postgres |
| Move-In Guarantee | `VERIFIED` | Structural — the edge does not exist in the graph |
| Audit log (NFR-2) | `VERIFIED` | Money, verification, consent, config |
| Money as integer shillings | `VERIFIED` | bigint throughout; strings at the boundary |
| Media storage | `BLOCKED` | Interface + mock; provider procurement-gated |
| PSP | `BLOCKED` | Interface + mock; procurement-gated |
| NIN / liveness | `BLOCKED` | Interface + mock; procurement-gated |
| SMS delivery | `BLOCKED` | No provider; blocks F-004 |
| Rate limiting | `INERT` | Not implemented; belongs at the edge |

---

## The shape of the problem

The backend is the finished part. **24 of 54 routes have no client caller**,
and the gaps cluster at exactly two points in the journey — assigning a
viewing, and creating a deal — which together sever the tenant path in the
middle.

A tenant can today: register, browse, open a listing, request a viewing.
Then nothing further can happen in the real product, because no surface can
assign that viewing and no endpoint can create the deal that would follow.

Everything downstream of that break (escrow, move-in, commission,
settlement) is built, tested, and unreachable.
