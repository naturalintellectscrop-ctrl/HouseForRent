> **Stale as of 2026-08-24 — retraced only in part.**
>
> This matrix was traced against `apps/console` and `apps/mobile`. The Expo
> client has been removed and the console became `apps/web`, absorbing the
> public marketplace and both user portals, so the *client* half of every
> row below needs re-tracing before the numbers here can be trusted again.
>
> What is known to have changed since:
>
> - **The full journey is now connected end to end through HTTP**, proven
>   by `apps/api/scripts/journey-http.mjs` — 56/56 steps, no database
>   connection held. That script is a better connectivity check than this
>   document, because it cannot pass by inspection.
> - **Newly connected:** the taxonomy routes (F-015), listing photography,
>   `GET /v1/commission-rate`, the identity endpoints (F-017),
>   `sign-agreement` (F-014), and the whole landlord authoring path
>   (`POST /properties`, `POST /listings`, agreement accept, publish,
>   withdraw) which now has a real surface in `/landlord`.
> - **Still INERT:** mandate submission and decision — brokers and
>   management companies cannot publish, which is the remaining half of
>   F-003. Password reset, staff provisioning and device-session
>   management (F-004, F-005, F-006) also still have no UI.
>
> Retrace before quoting the headline number.

---

# House For Rent — Connectivity Matrix

Traced by enumerating controller routes and grepping actual call sites in
`apps/console` and `apps/mobile`. Nothing here is inferred from a filename.

**First traced** at commit `6274e38`. **Updated 2026-08-17** after F-001,
F-002 and F-007.

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

**13 of 57 routes have no client caller** (was 24 of 54 at the audit).

F-007 connected nine deal-transition routes at once, which is why the number
finally moved. What remains is concentrated rather than scattered: six
listing/property routes waiting on the F-003 build, five auth routes waiting
on F-004/F-005/F-006, one health check, and one superseded route.

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
| **Money leaves escrow — settled or refunded** | ✅ | ✅ | ✅ | ✅ | ✅ **console** | ✅ | Landlord paid net, or tenant refunded in full | **`VERIFIED`** — F-007 closed |
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
| **Sign the deal agreement** | ✅ | ✅ | ✅ | ✅ | ✅ **console** | ✅ | Rent + rate frozen onto the deal | **`VERIFIED`** — F-007 |

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
| **Settle / refund / close** | ✅ | ✅ | ✅ | ✅ | ✅ **console** | ✅ | Every exit reachable, with explicit confirmation | **`VERIFIED`** — F-007 |
| **Deal queue + per-deal ledger position** | ✅ | ✅ | ✅ **new** | ✅ | ✅ **console** | ✅ | A settlement queue an operator can clear | **`VERIFIED`** — F-007 |
| **Dispute hold / resolve** | ✅ | ✅ | ✅ | ✅ | ✅ **console** | ✅ | Blocks settlement, restores prior status | **`VERIFIED`** — F-007 |
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

### B — Missing UI, backend capability exists (10)

| Route | Blocked by |
|---|---|
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

Nine deal-transition routes left this category when F-007 shipped:
`match-tenant`, `sign-agreement`, `earn-commission`, `settle`, `close`,
`refund`, `cancel`, `dispute-hold` and `resolve-dispute` are all reachable
from `/ops/deals/:dealId`.

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

At the audit it broke twice — at assignment and at deal creation — and a
tenant could get no further than "viewing requested". After F-001 and F-002
it ran to funded escrow and stopped, with no way for money to leave.

It now runs unbroken, end to end, every step through a real surface:

```
register → browse → listing detail → request viewing
  → dispatch queue → assign → officer's board
  → field report → conduct → introduction record
  → open the deal → match tenant → sign agreement
  → fund escrow → confirm move-in
  → recognise commission → settle → close
```

with refund, dispute hold and dispute resolution reachable at the points the
state machine permits them.

**What still cannot happen.** Nothing can enter the system at the top: no
surface creates a property or a listing (F-003, decided but not built), and
brokers and management companies cannot publish at all because mandate
submission has no route. Every deal today therefore begins from
seed-scripted inventory.

**What is reachable but not yet safe.** F-012 — the amounts on the money
path are reconciled against nothing. The settlement form pre-fills from the
ledger, which narrows the fat-finger window, but a pre-fill is a convenience
and not a check: an operator can still type any figure and the server will
accept it.
