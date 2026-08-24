# House For Rent — API Specification

**Product:** House For Rent (V1)
**Owner:** Natural Intellects Ltd
**Document:** 4 of 4 (PRD → Technical Architecture → Data Model → **API Specification**)
**Authority:** Subordinate to the SSOT, and consistent with the approved PRD, Technical Architecture and Data Model. This document does not introduce business decisions. Where it must make an interface choice with behavioural consequences, it is flagged as an **[API Decision]** with reasoning.

---

## 1. Purpose and the line this document holds

Documents 1–3 define what the product does, how it is structured, and what
it stores. This one defines **the only ways in**. That framing matters more
here than in the other three, because the API is where the safeguards built
in Stages 0–6 either hold or leak:

- The deal state machine is only authoritative if **no endpoint can set a
  status directly** (§5).
- The ledger is only trustworthy if **no client can post to it** (§6).
- The Move-In Guarantee only exists if **there is no endpoint that releases
  funds before move-in** (§5.3).
- Verification only means something if **the client cannot assert it about
  itself** (§7).

Every rule below exists to keep one of those true. An endpoint that is
convenient but violates one of them is a defect, not a trade-off.

---

## 2. Conventions

**Transport.** HTTPS only. JSON request/response bodies. REST-ish resource
paths; state changes are POSTs to named transition sub-resources rather than
PATCHes of a status field (see §5.1 for why).

**Versioning.** All paths are prefixed `/v1`.

**Money.** Every monetary value crosses the wire as a **string of integer
shillings** (`"1000000"`), never a JSON number.

> **[API Decision] Money as strings, not JSON numbers.**
> JSON numbers are IEEE-754 doubles in most parsers, so any amount above
> 2^53 silently loses precision, and a client that does arithmetic on a
> parsed number can produce a value that disagrees with the server's
> `bigint`. Serialising as a string makes the client's parser incapable of
> corrupting the value and forces any client-side handling to be deliberate.
> The cost is a string→BigInt conversion at both ends; the benefit is that a
> whole class of silent money corruption cannot occur.

**Timestamps.** ISO 8601 with timezone offset (`2026-07-27T14:30:00Z`).

**Identifiers.** UUID strings.

**Errors.** A consistent envelope, with a machine-readable `code`:

```json
{
  "error": {
    "code": "ILLEGAL_TRANSITION",
    "message": "illegal deal transition escrow_funded → settled: not permitted by the state machine",
    "details": { "from": "escrow_funded", "to": "settled" }
  }
}
```

| HTTP | When |
|---|---|
| 400 | Malformed body, failed validation |
| 401 | Missing or invalid credentials |
| 403 | Authenticated but the role may not perform this action (NFR-1) |
| 404 | Resource does not exist, **or** exists but this caller may not know it does (§7.4) |
| 409 | Legal request, illegal in the current state (illegal transition, already-settled deal) |
| 422 | Domain rule rejected it (unmandated publish, unbalanced posting) |
| 500 | Unexpected — never used for an anticipated domain rejection |

**Idempotency.** Every state-changing money endpoint accepts an
`Idempotency-Key` header (§8).

---

## 3. Authentication and roles

Authentication yields a session bound to a `user_account`, which carries
exactly one `auth_role` (Data_Model.md §2.2): `tenant`, `lister`, `foo`,
`admin`.

**The role is read from the server-side session only.** No endpoint accepts a
role, party ID, or tier in a request body or header. A client stating who it
is would make the entire authorisation matrix decorative.

Requests carry `Authorization: Bearer <access-token>`.

| Endpoint | Method | Purpose |
|---|---|---|
| `/v1/auth/register` | POST | Create account (tenant or lister; `foo`/`admin` are provisioned by ops, never self-served) |
| `/v1/auth/login` | POST | Exchange credentials for tokens |
| `/v1/auth/refresh` | POST | Exchange a refresh token; rotates the `session` row |
| `/v1/auth/logout` | POST | Revoke the current session |

> **[API Decision] `foo` and `admin` cannot be self-registered.**
> Those roles can verify properties, decide mandates, resolve disputes and
> change configuration. Allowing signup to mint one would make every
> downstream control meaningless. They are created by an existing admin.

---

## 4. The authorisation matrix (NFR-1)

This table is the contract. An endpoint not listed for a role **must return
403** for that role. Cross-role access to money and state-transition
endpoints is denied, without exception.

### 4.1 Deal transitions

| Endpoint | tenant | lister | foo | admin |
|---|:--:|:--:|:--:|:--:|
| `POST /deals/{id}/match-tenant` | — | — | ✅ | ✅ |
| `POST /deals/{id}/sign-agreement` | — | ✅¹ | — | ✅ |
| `POST /deals/{id}/fund-escrow` | ✅¹ | — | — | ✅ |
| `POST /deals/{id}/confirm-move-in` | ✅¹ | — | — | ✅ |
| `POST /deals/{id}/earn-commission` | — | — | — | ✅ |
| `POST /deals/{id}/settle` | — | — | — | ✅ |
| `POST /deals/{id}/close` | — | — | — | ✅ |
| `POST /deals/{id}/refund` | — | — | — | ✅ |
| `POST /deals/{id}/cancel` | — | ✅¹ | — | ✅ |
| `POST /deals/{id}/dispute-hold` | — | — | — | ✅ |
| `POST /deals/{id}/resolve-dispute` | — | — | — | ✅ |

¹ **and** must be a party to that specific deal (§7.4). Being a tenant is not
enough; being *this deal's* tenant is required.

> **[API Decision] `earn-commission` and `settle` are admin-only.**
> Neither is a user action. Commission recognition is an accounting event
> that follows move-in, and settlement disburses client money. Exposing
> either to a landlord would let the party who benefits trigger their own
> payout; exposing `earn-commission` to a tenant would let them create
> revenue. Both are operations the company performs.

> **[API Decision] The tenant confirms move-in, not the landlord.**
> Move-in confirmation is what releases the tenant's own money from
> protection. The party whose funds are at risk is the one who says the
> guarantee condition is met. A landlord-confirmed move-in would let the
> beneficiary unlock the escrow.

### 4.2 Listings, verification, mandates

| Endpoint | tenant | lister | foo | admin |
|---|:--:|:--:|:--:|:--:|
| `POST /properties` | — | ✅ | — | ✅ |
| `POST /listings` | — | ✅¹ | — | ✅ |
| `POST /listings/{id}/publish` | — | ✅¹ | — | ✅ |
| `POST /listings/{id}/withdraw` | — | ✅¹ | — | ✅ |
| `POST /listings/{id}/verify` | — | — | ✅ | ✅ |
| `POST /listings/{id}/confirm-availability` | — | — | ✅ | ✅ |
| `POST /mandates` | — | ✅ | — | ✅ |
| `POST /mandates/{id}/decide` | — | — | ✅ | ✅ |
| `GET /listings/{id}/agreement` | — | ✅ | — | ✅ |
| `POST /listings/{id}/agreement/accept` | — | ✅¹ | — | — |
| `GET /neighbourhoods` | public | public | public | public |
| `GET /amenities` | public | public | public | public |
| `POST /neighbourhoods` | — | — | — | ✅ |
| `POST /neighbourhoods/{id}/service-area` | — | — | — | ✅ |
| `GET /commission-rate` | public | public | public | public |
| `GET /media/{mediaAssetId}` | public | public | public | public |
| `GET /listings/{id}/photos` | public | public | public | public |
| `POST /listings/{id}/photos` | — | ✅¹ | ✅ | ✅ |
| `POST /listings/{id}/photos/{photoId}/remove` | — | ✅¹ | ✅ | ✅ |

¹ and must be the lister who owns that listing.

#### Amendment A4 — ¹ was aspirational until 2026-08-24 (F-016)

The footnote above has always read "and must be the lister who owns that
listing". For `POST /listings`, `publish` and `withdraw` it was **not
implemented**: the handlers carried `@Roles('lister', 'admin')` and nothing
more, so any registered lister could create terms against a stranger's
property, publish it, or withdraw a competitor's live inventory by knowing
an id.

`ListingsService.assertOwnsListing()` / `assertOwnsProperty()` now enforce
it on every lister-callable mutation, returning **403
`NOT_THE_PROPERTY_OWNER`**. 403 rather than 404 because the caller already
holds the role and already possesses the id — hiding the resource would
conceal nothing and would deny a landlord who mistyped their own id the real
reason.

Admin is exempt: operations legitimately author on a landlord's behalf, and
every such act is already attributable through the audit trail.

#### Amendment A5 — the taxonomy is now discoverable (2026-08-24, F-015)

`POST /properties` requires a `neighbourhoodId` and `GET /listings` accepts
one as a filter, but **no route returned any**. A client was expected to
know identifiers it had no way to obtain, so every seed and test reached
past the API with `prisma.neighbourhood.create`, and no landlord could
author a property from any surface.

`GET /v1/neighbourhoods` is **public**, for the same reason `GET /listings`
is: the taxonomy IS the search vocabulary (FR-2.2), and a filter whose
values cannot be discovered is not a filter. It defaults to the service area
only, because a neighbourhood outside the corridor can never carry a live
listing (FR-2.5) and offering one in a picker sets a landlord up to publish
into a void. `liveListingCount` applies the same predicate the search does,
freshness included — a count that says 3 where the search returns 2 is a
small dishonesty on a page whose job is being believed.

Creation is **admin-only**: `inServiceArea` decides what the public feed may
contain, and a lister able to mint an in-service neighbourhood would have
routed around corridor scoping entirely.

`GET /v1/commission-rate` is public because it is a PUBLISHED commercial
term. The marketing pages state what we charge landlords; serving it from
the same `rateInForce()` an agreement snapshots means the website cannot
advertise a rate the system would not honour.

#### Amendment A6 — listing photography (2026-08-24)

The public marketplace makes the property the visual hero, which requires
images the API can serve. `media_asset` existed but held only an opaque
`storage_ref` from the V1 mock capture provider — no MIME type, no bytes.

`listing_photo` carries **provenance as a first-class field**, not a flag:
`field_officer`, `lister`, or `development_fixture`. A tenant is entitled to
know whether the photograph was taken by our officer, supplied by the person
letting the property, or seeded for a demonstration.

> **[API Decision] Provenance is derived from the caller's role, never from
> the request body.** `POST /listings/{id}/photos` accepts no `source`. A
> lister able to send `source: 'field_officer'` could label their own
> snapshot as evidence that our officer stood in the room — the single claim
> this platform sells, and the one a lister has every incentive to make
> falsely. `development_fixture` is reachable from no HTTP route at all.

Browser uploads do **not** pass through the FOO compression ladder
(`MediaService`, NFR-5). That ladder's post-condition genuinely checks each
rung's ceiling, and satisfying it for browser uploads would require a
server-side encoder; without one the only way to pass would be to weaken the
check, and that check is the low-bandwidth guarantee. Browser photography
takes an honest separate path: the client downscales, the server enforces a
hard 1.5MB ceiling at the boundary (**413 `PHOTO_TOO_LARGE`**), and the
bytes are stored once. The ladder is left intact for the field app it was
built for.

#### Amendment A3 — agreement endpoints and `GET /auth/me` added (2026-07-31)

§4.2 listed no agreement endpoints, yet **FR-9.1 requires the lister to
accept a listing agreement before the listing goes live** and §11 does not
name agreements among the deliberate absences — a gap, not a prohibition.
`publish` accordingly enforces a **fourth** gate: verified, in-corridor,
mandated, **and an accepted agreement**.

> **[API Decision] Admin may READ the terms but may NOT accept them.**
> Support needs to answer "what was I shown?", which is a read. Acceptance
> is a landlord signing a contract that names them as the payer (FR-9.2);
> no operator may do that on their behalf. This is the one row in §4 where
> admin is deliberately absent.

`GET /auth/me` was also added (any authenticated role). The access token
carries only `sub` — role and party are re-read from the database on every
request, so a role change or suspension takes effect immediately rather than
lingering until expiry. That is the right design, but it leaves a client no
way to learn its own role in order to render the correct surface. The
endpoint discloses only what the caller already proved by authenticating,
confers no privilege, and cannot be used to learn about anyone else.

> **[API Decision] A lister may call `publish`, but cannot bypass its gates.**
> `publish` is lister-callable because publishing is their action. It is not
> a security hole: the endpoint delegates to `ListingsService.publish()`,
> which independently checks field verification, service-area membership and
> the per-property mandate. A lister calling it on an unverified or
> unmandated listing receives 422. **`verify` is FOO-only** — a lister
> verifying their own property would dissolve the entire trust proposition.

### 4.3 Viewings and field ops

| Endpoint | tenant | lister | foo | admin |
|---|:--:|:--:|:--:|:--:|
| `POST /viewings` (request) | ✅ | — | — | ✅ |
| `POST /viewings/{id}/assign` | — | — | — | ✅ |
| `POST /viewings/{id}/conduct` | — | — | ✅¹ | ✅ |
| `POST /viewings/{id}/no-show` | — | — | ✅¹ | ✅ |
| `POST /viewings/{id}/field-report` | — | — | ✅¹ | ✅ |
| `POST /viewings/{id}/media` | — | — | ✅¹ | ✅ |
| `GET /viewings/assigned/me` | — | — | ✅ | ✅ |
| `GET /viewings/introductions` | — | — | ✅ | ✅ |

¹ must be the assigned FOO.

#### Amendment A2 — media capture and field-ops reads added (2026-07-30)

The original §4.3 listed no media endpoint. That was a **gap, not a
prohibition**: FR-5.5 mandates that the field visit capture professional
media, and §11 does not list media among the deliberate absences. Added
`POST /viewings/{id}/media` under the same ¹ assigned-FOO constraint as the
other field operations, since a capture is an assertion about what an
officer saw.

Two staff-only reads were added alongside it: `GET /viewings/assigned/me`
(an officer's dispatch board, FR-5.2) and `GET /viewings/introductions`
(introduction records as queryable circumvention evidence, FR-5.3/FR-8.3).
The latter is **staff-only by design** — it is a linkage between two
counterparties, and exposing it to either would tell a landlord which other
tenants an officer introduced.

> **[API Decision] There is NO endpoint that creates an introduction record.**
> The record is a *consequence* of conducting a viewing, written in the same
> transaction as the status change and never separately. If it were
> independently creatable, an introduction could be fabricated for a visit
> that never happened — which is precisely the evidence it exists to be.
> Equally, `conduct` derives the landlord from the property and the
> timestamp from the server; no caller chooses what the evidence says.

> **[API Decision] `assign` is admin-only, not FOO-self-service.**
> Assigning field work is an ops function. An officer who could assign
> themselves would make the service-corridor and workload controls advisory
> rather than enforced.

> **[API Decision] A non-assigned FOO gets 403, not 404 (unlike §7.4).**
> The deal-party 404 exists to stop *outsiders* enumerating deal IDs. Every
> caller reaching the assigned-FOO check is already staff with legitimate
> system-wide visibility, so concealing that a viewing exists buys no
> security and costs a dispatched officer a baffling error. 403 with
> `NOT_ASSIGNED_FOO` is both safe and operationally honest.

**No viewing cancel endpoint exists.** `cancelled` is a value in the schema's
status enum, but §4.3 lists no operation reaching it; adding one is a scope
change requiring an SSOT amendment, not an API iteration (§11).

### 4.4 Screening, onboarding, config, admin

#### Amendment A7 — tenant identity verification became reachable (2026-08-24, F-017)

`POST /viewings` refuses a tenant who is not identity-verified (**422
`TENANT_NOT_VERIFIED`**), and that rule is correct: a landlord accepts our
terms partly because the person walking into their property has been
identified. But **nothing in the API could make a tenant verified.**
`OnboardingService` and `IdentityService` existed, were tested, and were
reachable only from spec files and seed scripts writing to Prisma directly.

The practical effect was that the tenant journey ended at registration for
every real user while every suite stayed green — the tests obtained through
the database a state no client could obtain (the F-011 pattern). A step only
a seed script can perform is not a step in the product.

| Endpoint | tenant | lister | foo | admin |
|---|:--:|:--:|:--:|:--:|
| `GET /identity/me` | ✅ | ✅ | ✅ | ✅ |
| `POST /identity/consent` | ✅ | — | — | ✅ |
| `POST /identity/verify` | ✅ | — | — | ✅ |
| `POST /identity/screen` | ✅ | — | — | ✅ |

**The subject is always the caller.** No endpoint here accepts a party id,
so none can be pointed at somebody else. Consent is a separate call made
FIRST, and `IdentityService` independently refuses to verify a party with no
consent record — the ordering is enforced, not merely intended (NFR-3, DPA
2019).

The NIN, phone and selfie reference cross the `IdentityProvider` boundary
and are **never persisted**: only a verification state and an opaque
provider reference remain. V1 runs a mock provider, and every surface that
calls this says so rather than implying a check against the national
register.

| Endpoint | tenant | lister | foo | admin |
|---|:--:|:--:|:--:|:--:|
| `POST /me/identity/*` | ✅ | ✅ | — | — |
| `POST /me/consent` | ✅ | ✅ | — | — |
| `POST /screening/runs` | — | — | — | ✅ |
| `GET /admin/config/*` | — | — | — | ✅ |
| `POST /admin/config/{key}/versions` | — | — | — | ✅ |
| `POST /admin/commission-rates` | — | — | — | ✅ |
| `GET /admin/reconciliation` | — | — | — | ✅ |
| `GET /admin/launch-gate` | — | — | ✅ | ✅ |
| `GET /admin/verification-queue` | — | — | ✅ | ✅ |

---

## 5. Deal transitions as endpoints

### 5.1 Only the transitions of §7.3 exist

There is **one endpoint per legal transition**, and no others.

> **[API Decision] Named transition endpoints, not `PATCH /deals/{id}`.**
> A generic status-patching endpoint would put the state machine's integrity
> in the request body, where every client and every future caller must be
> trusted to know the rules. Named endpoints mean the illegal transitions
> are not merely rejected — **they are unrepresentable**. There is no request
> a client can construct that expresses "escrow_funded → settled", because
> no endpoint accepts that intent. This mirrors `DealsService`, which
> deliberately exposes named operations and no `setStatus()`.

**There is no `escrow_funded → settled` endpoint, and no
`escrow_funded → cancelled` endpoint** (Data_Model.md §7.3, Amendment A1).
Their absence is the Move-In Guarantee at the API boundary.

### 5.2 Request and response shape

```http
POST /v1/deals/{dealId}/fund-escrow
Authorization: Bearer <token>
Idempotency-Key: 8f3c...
Content-Type: application/json

{
  "amount": "4000000",
  "paymentMethod": "mtn_momo",
  "accountRef": "+256700000001"
}
```

```json
{
  "deal": {
    "id": "…",
    "status": "escrow_funded",
    "monthlyRentSnapshot": "1000000",
    "commissionRateBpSnapshot": 10000,
    "commissionAmount": null
  },
  "transition": {
    "from": "agreement_signed",
    "to": "escrow_funded",
    "occurredAt": "2026-07-27T14:30:00Z"
  }
}
```

Rejections:

| Condition | Status | Code |
|---|---|---|
| Transition not legal from current status | 409 | `ILLEGAL_TRANSITION` |
| Caller's role may not trigger it | 403 | `FORBIDDEN_ROLE` |
| Caller is not a party to this deal | 404 | `NOT_FOUND` (§7.4) |
| Custodian declined | 502 | `PROVIDER_REJECTED` |

### 5.3 What has no endpoint, and why

| Not exposed | Reason |
|---|---|
| Setting `deal.status` directly | The state machine would stop being authoritative |
| `escrow_funded → settled` | The Move-In Guarantee (FR-8.2) |
| `escrow_funded → cancelled` | Amendment A1 — would strand held client money |
| Writing `commissionAmount` | Derived from snapshots at the earn transition only (FR-7.3) |
| Writing `monthlyRentSnapshot` / `commissionRateBpSnapshot` | Set once at signing, immutable (FR-7.4) |
| Any `ledger_entry` write | §6 |

---

## 6. Money endpoints are intents, never ledger writes

**No endpoint accepts a ledger posting.** `ledger_account` and `ledger_entry`
have no create, update or delete endpoint at any role, including admin.

Clients express **intent** (`fund-escrow`, `refund`, `settle`); the server
runs the canonical postings of Data_Model.md §8.2 inside one transaction.

> **[API Decision] Not even admin can post to the ledger.**
> An admin-only "manual journal entry" endpoint is the standard request and
> the standard way ledgers become untrustworthy: it makes every balance
> arguable and every reconciliation ambiguous. Corrections are reversing
> postings produced by the operation that needs them, never free-form entry.
> If an operational situation genuinely cannot be expressed by an existing
> intent, the correct response is a new intent endpoint with defined
> postings — reviewed — not a general-purpose write.

Read-only ledger projections are available to admin (§9.3).

---

## 7. Guarantees the API layer must uphold

### 7.1 The client never computes money
No endpoint accepts a commission amount, rate, or net-of-commission figure.
The client sends the upfront amount it is paying; every derived figure is
server-computed from the deal's snapshots.

### 7.2 The client never asserts verification
No endpoint accepts `isVerified`, `verificationState`, or a screening
verdict. These are outcomes of server-side processes. Trust signals are
projected onto reads (§9.1); they are never inputs.

### 7.3 The client never supplies its own identity
`partyId` is resolved from the session. An endpoint taking a party ID from
the body would let any authenticated caller act as anyone else.

### 7.4 Existence is not disclosed to non-parties

> **[API Decision] 404, not 403, for a deal the caller is not party to.**
> Returning 403 confirms the resource exists, which leaks that a given deal
> ID is real and lets an attacker enumerate them. Non-parties get 404 — the
> same response as a genuinely absent record. 403 is reserved for *role*
> failures, where the caller legitimately knows the endpoint exists but may
> not use it.

### 7.5 PII is minimised on every read
Landlord-facing tenant reads return a verdict and display name, never NIN,
identity-provider references, or consent internals (FR-6.3, NFR-3).

---

## 8. Idempotency

Required (`Idempotency-Key` header) on: `fund-escrow`, `refund`, `settle`,
and every PSP callback endpoint.

Semantics: a repeat with the same key returns the **original** result and
performs no new side effect. Keys are stored on `psp_instruction`
(`idempotency_key`, unique).

For deal-scoped money operations the server also derives a deterministic key
(`settle:{dealId}`, `refund:{dealId}`), so a retry collides with the original
**even if the client forgets the header or sends a fresh one**.

> **[API Decision] Deterministic server-side keys in addition to client keys.**
> Client-supplied idempotency depends on the client behaving correctly under
> exactly the conditions where clients behave worst — timeouts, retries,
> crashes. A server-derived key means "settle this deal" can only ever
> happen once regardless of what the client sends. The client key still
> matters for distinguishing two *legitimately different* operations.

### 8.1 PSP callbacks

```http
POST /v1/webhooks/psp/instruction-status
```

Unauthenticated by session; authenticated by provider signature. Replays are
deduplicated on `(instruction, toState)`, so a repeated webhook is a no-op
rather than a second event (Stage 4).

---

## 9. Read endpoints

### 9.1 Tenant search and detail

```http
GET /v1/listings?q=&neighbourhoodId=&minRent=&maxRent=&bedrooms=
                &amenityId=&propertyType=&furnished=&sort=&limit=&offset=
```

Always constrained to `live` + `verified` + in-service-area + available.
`includeStale` is opt-in. **Filters narrow only** — a caller cannot widen
past the public-feed definition, and the property-level narrowing is merged
into the base predicate rather than reassigning it, so a later filter cannot
quietly drop `neighbourhood.inServiceArea`.

`q` matches **neighbourhood and landmark only**, deliberately not the
description: a lister writing their own copy must not be able to buy
relevance by stuffing it with the names of neighbourhoods the property is
not in.

`sort` defaults to `fresh` — most recently confirmed available first,
because a wasted trip is the failure this product exists to prevent.

```json
{
  "results": [
    {
      "listingId": "…",
      "propertyId": "…",
      "monthlyRent": "1400000",
      "bedrooms": 2,
      "bathrooms": 1,
      "propertyType": "apartment",
      "furnished": "furnished",
      "neighbourhoodName": "Ntinda",
      "landmarkText": "Two minutes off Kimera Road, behind the Total station",
      "isVerified": true,
      "isStale": false,
      "daysSinceConfirmed": 2,
      "photos": [
        {
          "id": "…",
          "mediaAssetId": "…",
          "url": "/v1/media/…",
          "caption": null,
          "sortOrder": 0,
          "source": "field_officer",
          "isFieldVerified": true,
          "isDevelopmentFixture": false
        }
      ],
      "freeForTenants": true
    }
  ],
  "totalCount": 12,
  "limit": 24,
  "offset": 0,
  "emptyStateMessage": null
}
```

`totalCount` is the matches BEFORE the page window, and `emptyStateMessage`
is keyed off that total rather than off the page — page 3 of 80 results is
not an empty state, and saying so would be a lie of omission.

`GET /v1/listings/{id}` adds the full terms, the amenities, the photographs,
and the field-confirmed summary (FR-4.3), projected from the structured
`field_report` — never free text:

```json
{
  "depositAmount": "700000",
  "requiredMonthsUpfront": 2,
  "expectedUpfront": "3500000",
  "descriptionText": "…",
  "neighbourhoodId": "…",
  "amenities": [{ "id": "…", "name": "Borehole" }],
  "fieldConfirmed": {
    "conditionRating": "good",
    "matchesListing": true,
    "isAvailable": true,
    "reportedAt": "2026-07-25T09:00:00Z"
  }
}
```

`fieldConfirmed` is `null` when no report exists. **Never a fabricated
placeholder** — an unvisited property must not look inspected.

> **[API Decision, 2026-08-24] `expectedUpfront` is served, not computed by
> the client.** It is the figure a tenant funds at agreement, derived here
> from the listing's own published terms — the same basis `fund-escrow`
> derives its authoritative amount from (F-012). The website displays it and
> never recomputes it. A client multiplying rent by months would hold a
> second copy of the number somebody is about to pay, on the least
> trustworthy side of the boundary, which is precisely the defect class that
> finding was about.

Detail is scoped **by id**, not scanned out of the feed. The feed is
paginated; finding a listing by paging through it would have made deep links
work only for whatever happened to land on page one.

A listing outside the public feed — unverified, withdrawn, or out of
corridor — returns **404, not 403**. A 403 would confirm it exists, which is
how an unpublished address becomes discoverable by probing.

### 9.2 Deal reads
`GET /v1/deals/{id}` — parties and admin only (§7.4). Includes status,
snapshots, commission amount when earned, and transition history.

### 9.3 Admin observability

| Endpoint | Returns |
|---|---|
| `GET /v1/admin/reconciliation` | Latest ledger-vs-custodian check, with discrepancies surfaced |
| `GET /v1/admin/launch-gate` | Live verified in-corridor fresh inventory against the configured gate (FR-10.3) |
| `GET /v1/admin/verification-queue` | Properties awaiting verification, with mandate states (FR-10.2) |
| `GET /v1/admin/deals?status=…` | Deal-state distribution |

---

## 10. Config and rate endpoints

Version-creating, never mutating (FR-10.1).

```http
POST /v1/admin/config/{key}/versions      → new config_version
POST /v1/admin/commission-rates           → new commission_rate_version
```

There is **no** `PUT`/`PATCH`/`DELETE` on either. A rate change creates a new
version; in-flight deals hold snapshots and are structurally unaffected
(FR-7.4).

> **[API Decision] No endpoint can edit a rate version.**
> If an existing version were editable, the snapshot mechanism would still
> hold for deals already signed, but the *provenance* would be corrupted —
> `commission_rate_version_id` would point at a row whose value had changed,
> making it impossible to prove what rate a deal was signed under. Both
> tables are immutable in the database; the API simply offers no path that
> would attempt it.

---

## 11. What this API deliberately does not expose (V1)

| Absent | Why |
|---|---|
| Any sale/transaction-type-switching endpoint | Sales are out of V1 (Decision 6); the seam is schema-only |
| Premium-tier endpoints | Tier is a seam, not an active operation (Decision 1) |
| Certified-partner viewing endpoints | Viewing Phases 2–3 are post-V1 (Decision 9) |
| Employment/reference screening submission | Post-V1; V1 collects no such documents (Decision 10, FR-6.3) |
| Property-management/recurring-billing | Post-V1 (SSOT §6) |
| Tenant-side fees or charges | Tenants pay nothing — structural (Decision 3) |
| Raw ledger writes | §6 |

Their absence is deliberate. Adding one is a scope change requiring an SSOT
amendment, not an API iteration.

---

## 12. Implementation checklist

1. Auth (register/login/refresh/logout) with `session` rotation.
2. A role guard reading the session, plus a party-membership guard for
   deal-scoped endpoints (§7.4).
3. One controller per module, exposing only the endpoints in §4.
4. DTO validation rejecting unknown fields, so a client cannot smuggle
   `status`, `commissionAmount` or `isVerified` into a body.
5. Money serialised as strings at the boundary (§2).
6. Idempotency middleware for §8, with server-derived keys.
7. Tests: **every cell of the §4 matrix** — each permitted role succeeds,
   each denied role gets 403, and non-parties get 404.
