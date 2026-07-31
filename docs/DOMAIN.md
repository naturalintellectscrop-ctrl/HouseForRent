# House For Rent — Domain Model (Stage 0)

Maps every table in `backend/prisma/schema.prisma` to the SSOT decision(s) and
Data Model section it implements. This is Stage 0 output only: schema and
migrations, no business logic, no APIs, no screens.

---

## Local database setup (read this before running anything)

This environment has no system-installed PostgreSQL and no Docker. The
database is `npx prisma dev`'s bundled local Postgres server (a real
PostgreSQL 17.5, compiled to WASM), started once per session:

```
cd backend
npx prisma dev          # prints DATABASE_URL / SHADOW_DATABASE_URL, keep running
```

`.env` is already pointed at its default port (`51214`).

**Known quirk:** `prisma migrate dev` / `migrate deploy` cannot complete their
connection handshake against this particular server — the native Rust
schema-engine binary's driver (`quaint`) throws `UnexpectedMessage` /
`P1017 Server has closed the connection` against it, reproducibly. A plain
`pg` connection (and the Prisma Client, via `@prisma/adapter-pg`) connects to
the same server without issue every time — this is specific to the
schema-engine's own connection path, not the server or the app.

Workaround, used for every migration in this project:
1. Generate the SQL with `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` (or `--from-migrations`/`--to-schema` for incremental diffs) — this only parses the schema, no live connection needed.
2. Save it under `prisma/migrations/<timestamp>_<name>/migration.sql` with a sibling `migration_lock.toml` (provider = "postgresql"), matching Prisma's own migration folder convention.
3. Apply it with `node test-infra/apply-migrations.mjs` (reads `DATABASE_URL`, applies any not-yet-applied migration directories in order, tracks state in an `_applied_migrations` table, wraps each in a transaction). Idempotent — safe to re-run.

If a real PostgreSQL server (local install, Docker, or hosted) becomes
available later, `prisma migrate dev`/`deploy` should work normally against it
with no schema changes — this workaround is purely about this sandbox's local
dev server, not the schema or the app.

**TODO — verify before relying on this for any real environment:** the
standard `prisma migrate deploy` path is currently *unexercised* (only the
`migrate diff` + raw-`pg`-apply workaround has actually run). The first time
a real PostgreSQL instance (local install, Docker, or hosted — Supabase,
Neon, Railway, RDS, etc.) is available, run `npx prisma migrate deploy`
against it from a clean database and confirm all migrations in
`prisma/migrations/` apply cleanly through the standard path before trusting
it for staging/production.

**Second quirk found, informational only:** this WASM Postgres server can
also desync at the wire-protocol level when a script issues a query without
awaiting/serializing around a *previous failed statement* on the same
connection (observed as `pg` throwing `Received unexpected parseComplete
message from backend` / `... commandComplete ...`, and a "success" being
reported for a statement that the server actually rejected moments later,
out of order). This was caught precisely because a follow-up trigger-check
script raced ahead of an async rejection. It did **not** affect the real
test suite (`src/schema/immutability.spec.ts`, run via Jest), where every
assertion is a properly-awaited Prisma call — Jest's 10/10 pass is the
trustworthy result. Lesson: any one-off diagnostic script against this dev
server should wrap each statement in an explicit `BEGIN`/`ROLLBACK` (or just
use the Jest suite) rather than firing bare sequential queries on one
connection after a failure.

---

## Module ownership map

(Mirrors Data_Model.md §1 — one module per table, cross-module reads go
through interfaces once services are built in Stage 1+.)

### Identity & Verification

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `party` | Decision 8 (tiers), general | Product-agnostic actor. Role is contextual via `UserAccount.authRole`, not a fixed column — one human can be both tenant and landlord. |
| `user_account` | — (auth plumbing) | Auth binding for a party. V1: one primary role per account. |
| `session` | — (auth plumbing) | Data_Model.md §2.3 lists this with "fields per auth choice, not detailed there." Added in the immutability-review pass (was omitted from the first Stage 0 pass — an oversight, not a deliberate exclusion). Minimal V1 shape: `userAccountId`, `refreshTokenHash`, `expiresAt`, `revokedAt`. **Deliberately NOT in the 🔒 set** — sessions are legitimately mutated (revocation) and deleted (expiry cleanup); marking it immutable would be wrong, not merely unnecessary. |
| `lister_profile` | Decision 8 | Tier (`property_owner` / `broker_agent` / `property_mgmt_company`) drives verification + mandate requirements. |
| `identity_verification` | Decision 10 (screening), Decision 8 | Who a party is. State-per-method (`nin`/`phone`/`selfie_match`), not a single boolean, so the three-factor requirement is explicit and auditable. No plaintext NIN — only state + opaque `providerRef`. |
| `consent_record` 🔒 | Decision 10, DPA 2019 (SSOT §5, PRD NFR-3) | Immutable historical fact; purpose + timestamp + retention metadata. |
| `property_mandate` | Decision 8 | Authority to market a *specific* property — separate concern/data from identity. `unique(listerPartyId, propertyId)`. |

### Config

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `config_parameter` / `config_version` 🔒 | Decision 2 (corridor), Decision 4 (rate is configurable) | Generic versioned config: service area, freshness window, screening module set, required-months default. Current value = latest version with `effectiveFrom <= now()`. |
| `commission_rate_version` 🔒 | Decision 4, Decision 5 | Own table (not generic config) because it's money-touching. Rate stored as **basis points of one month's rent** (`10000 = 1.0 month`) — pure integer arithmetic, never float. A new rate is a new version; never mutates an existing one. |

### Listings & Properties

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `neighbourhood` | Decision 2 | Hierarchical taxonomy; `inServiceArea` flag is the materialised, query-fast projection of the authoritative `service_area` Config value. |
| `property` | Decision 1, 2, 6 | Taxonomy-first location (`neighbourhoodId` + optional `geoLat`/`geoLng` + required `landmarkText`); `streetAddress` optional, never required. `transactionType` ⟡ constrained to `rental` (seam for future `sale`, Decision 6). |
| `listing` | Decision 1, 2, 4, 5 | `monthlyRent`/`depositAmount` as `BigInt` shillings — `monthlyRent` is THE commission base (Decision 5). `tier` ⟡ constrained to `standard` (seam for premium, Decision 1). Availability is `availabilityStatus` + `availabilityConfirmedAt`; staleness is computed against the Config freshness window, not stored. |
| `amenity` / `listing_amenity` | Decision 1 (mid-market search) | Standard many-to-many for search filters. |

### Viewings & Field Ops

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `viewing` | Decision 9 | `conductedByRole` ⟡ constrained to `foo` (seam for future `certified_partner`, Decision 9 Phase 2/3). |
| `introduction_record` 🔒 | Decision 9, Decision 11 | Immutable circumvention evidence — the timestamped tenant↔property↔landlord↔FOO link. Persists independently of any `deal` row. |
| `field_report` | Decision 9 | Structured fields (`conditionRating`, `matchesListing`, `isAvailable`), not free-text-only — the baseline data for future Certified Partner standards. |

### Screening

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `screening_run` / `screening_module_result` | Decision 10 | Modular pipeline; V1 `moduleSet = ["identity"]`. Adding a module later = new `moduleKey` rows, no schema change, no tenant-flow change. Ability-to-pay is proven by escrow funding, not modelled here. |

### Deals & Guarantee (the spine)

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `deal` | Decision 3, 4, 5, 7, 11 | One authoritative `status` (`DealStatus` enum, Data_Model.md §7.3). `monthlyRentSnapshot` + `commissionRateBpSnapshot` are copied in at `agreement_signed` and never updated after — this is what makes rate immunity structural rather than disciplinary (Decision 4). `commissionAmount` is computed at `commission_earned`, from the snapshots only. |
| `deal_transition` 🔒 | Decision 3, 11 (auditability) | Full immutable state history; every transition is a row here. |

### Payments

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `ledger_account` | Decision 3, 7 | Typed accounts (`escrow_liability`, `commission_receivable`, `commission_revenue`, `landlord_payable`, `psp_clearing`) — product-agnostic, meaning comes from `accountType`. |
| `ledger_entry` 🔒 | Decision 3, 7 (money invariants, SSOT §5) | Immutable, balanced double-entry postings grouped by `postingId`. `amount` is always positive `BigInt`; `direction` carries the sign. **Immutability (no UPDATE/DELETE) is DB-enforced by trigger, proven by test** (see item 4 below). Balance-per-`postingId` (sum of debits = sum of credits) is a cross-row invariant Postgres has no generic constraint primitive for — that is enforced in the service layer in Stage 2, where it belongs alongside the posting transaction logic. |
| `psp_instruction` 🔒 | Decision 7 | Idempotent boundary to the external custodian; `idempotencyKey` is unique. |
| `reconciliation_check` | Decision 7 | Ledger-vs-PSP reconciliation snapshot. |

### Agreements

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `listing_agreement` 🔒 | Decision 3, 4, 11 | Originates the rate snapshot — at acceptance, `commissionRateVersion.rateBpOfMonth` and `monthlyRentAtSigning` are copied onto the `deal`. Names the landlord as payer. |

### Media & Audit

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `media_asset` | Decision 9 (field capture) | `perceptualHash` column present, unused in V1 — seam for future duplicate-listing detection. |
| `audit_event` 🔒 | NFR-2 (PRD) | Append-only log for money, verification, consent, config-change events. |

---

## Seam inventory (Data_Model.md §11 — cross-check)

| Seam field | V1 constraint | Future value(s) | Migration needed later? |
|---|---|---|---|
| `Property.transactionType` ⟡ | `rental` only (enum has one value) | `sale` | No — Postgres `ALTER TYPE ... ADD VALUE` |
| `Listing.tier` ⟡ | `standard` only | `premium` | No — enum add value |
| `Viewing.conductedByRole` ⟡ | `foo` only | `certified_partner` | No — enum add value |
| `ScreeningModuleResult.moduleKey` | `"identity"` only in practice | `"employment"`, `"references"`, `"risk_scoring"` | No — it's a free-text key, not an enum; new rows only |
| `MediaAsset.perceptualHash` | present, unused | duplicate-listing detection | No — column exists |
| `Neighbourhood` hierarchy | one corridor flagged (`inServiceArea`) | more corridors | No — data flag |

Every seam above is a single-value enum (or unused column) today; activating
the future value is an `ALTER TYPE ... ADD VALUE` or a data change, never a
migration of existing rows — matching the constraint Data_Model.md §11 sets.

---

## Modelling decisions and ambiguities flagged during Stage 0

1. **`Deal.commissionRateVersionId` and `Deal.agreementId` are nullable.** The
   Data Model shows them as plain FKs, but a `deal` in `status = created` or
   `tenant_matched` genuinely has no agreement or rate snapshot yet (those are
   only populated at the `agreement_signed` transition). Modelled as nullable
   with the non-null invariant enforced by the state-machine service (Stage
   3), not by the schema — flagging this since Data_Model.md's terse notation
   doesn't mark them nullable explicitly, but the narrative text ("SNAPSHOTTED
   at agreement_signed") makes clear they can't be populated before that.
2. **`Viewing.conductedByPartyId` is nullable.** A viewing can be `requested`
   or `scheduled` before a specific FOO is dispatched; Data_Model.md's
   `conducted_by_party_id` is written as a plain FK but the workflow (FR-5.2,
   dispatch/assignment) implies it's unset until assignment. Same reasoning
   as above.
3. **`ListingAgreement.acceptedAt` is nullable** for the same reason — a
   `listing_agreement` row can exist in an unaccepted state (`accepted =
   false`) before signing.
4. **Immutability (🔒) is enforced at the database level, not just the
   service layer.** Every 🔒 table (`consent_record`, `config_version`,
   `commission_rate_version`, `introduction_record`, `deal_transition`,
   `ledger_entry`, `psp_instruction`, `listing_agreement`, `audit_event`) has
   a `BEFORE UPDATE OR DELETE` trigger (`reject_mutation()`, one shared
   function, migration `20260727150100_immutable_tables`) that raises an
   exception on any attempted UPDATE or DELETE against an existing row,
   regardless of which DB role or code path issues it. Service-layer
   discipline alone was insufficient: a write path that bypasses the service
   (a manual fix, a future bug, an ad-hoc script) must still be rejected for
   the financial source of truth to actually be one. Corrections remain new
   rows (e.g. a reversing `ledger_entry` posting), never edits. Proven in
   `backend/src/schema/immutability.spec.ts` — one test per immutable table,
   each writing a real row then asserting both an UPDATE and a DELETE against
   it are rejected; plus one control-case test on `session` (not immutable),
   asserting update/delete on it *succeed*, so the test methodology itself is
   validated against a known-mutable table, not just proving absence of
   failure. All 10 tests pass.
5. **`ScreeningRun.dealId`, `LedgerAccount.dealId`/`ownerPartyId`,
   `LedgerEntry.dealId` are nullable**, matching Data_Model.md's explicit
   "nullable" notes in §6.1 and §8.1 (screening may precede a deal; some
   ledger accounts are internal/revenue accounts with no owner party).

6. **Immutable-table list completeness, cross-checked against Data_Model.md
   §12 rule 3.** That rule names exactly 9 tables:
   `ledger_entry`, `consent_record`, `introduction_record`, `deal_transition`,
   `commission_rate_version`, `config_version`, `listing_agreement`,
   `psp_instruction`, `audit_event`. All 9 carry the 🔒 marker in
   `schema.prisma` and all 9 have the DB trigger from item 4 above, verified
   by `SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE
   '%immutable%'` returning exactly these 9 rows. Nothing in that rule is
   missed; nothing extra was added to the 🔒 set.

No SSOT conflict was hit in Stage 0 — the Data Model's schema was
implementable as specified once the above (all schema-notation
clarifications, not business-rule changes) were resolved.

---

## What Stage 0 deliberately does not include

No API routes, no NestJS modules/services/controllers beyond the default
scaffold, no seed data, no business logic (mandate enforcement, ledger
balancing, state-transition validation) — all of that is Stage 1 onward, per
the Implementation Prompt Pack's sequencing.

---

## Stage 1 — Identity & Verification service

Built as `backend/src/identity/`, a NestJS module wired into `AppModule`:

- **`IdentityProvider` interface** (`interfaces/identity-provider.interface.ts`)
  — `verifyNin`/`verifyPhone`/`verifySelfieMatch`, each returning only
  `{ verified, providerRef }`. No raw NIN, phone, or selfie image crosses
  this boundary back into the app — the interface is deliberately shaped so
  it *cannot* leak the raw input, not just documented not to.
- **`MockIdentityProvider`** — the V1 implementation (deterministic: any
  input ending in `-fail` fails, everything else verifies). A real provider
  is a later implementation of the same interface (SSOT §8, procurement-
  gated); nothing in `IdentityService` or callers changes when it's swapped.
- **`IdentityService`** — per-method verification rows
  (`identity_verification`), consent recording (`consent_record`), and
  `isIdentityVerified(partyId)` (true only when the latest attempt for
  *every* required method — `nin`, `phone`, `selfie_match` — is `verified`).
  Verification is refused with a clear error if no consent row exists for
  purpose `identity_verification` yet — consent is a precondition, not an
  afterthought.
- **`MandateService`** — `submitMandate` / `decideMandate` /
  `hasVerifiedMandate`, and `canPublish({ listerTier, listerPartyId,
  propertyId })`, the domain-level enforcement primitive FR-3.2 calls for.
  `property_owner` always returns `true` (no mandate row required, FR-3.2
  AC); `broker_agent` / `property_mgmt_company` return `true` only if a
  `verified` `property_mandate` row exists for that exact `(lister,
  property)` pair. This method is the check — the Listings module (Stage 5)
  will call it before allowing a `listing.publicationState` transition to
  `live`; the transition itself is out of scope here.

**Acceptance criteria and the tests proving them** (`src/identity/identity.spec.ts`, 11 tests, all passing):

| Acceptance criterion | Test |
|---|---|
| Identity verification cannot proceed without recorded consent | `consent is recorded with purpose, timestamp, and policy version before verification is allowed` |
| A party is identity-verified only when all 3 methods are verified | `a party is identity-verified only once ALL three methods ... are verified` |
| The IdentityProvider is genuinely mockable/can fail (not hardcoded pass) | `the mock IdentityProvider surfaces failure deterministically` |
| No plaintext NIN is stored anywhere, even transiently in a returned object | `no plaintext NIN is stored: only state and an opaque providerRef persist` |
| Identity and mandate are independent: verified identity + zero mandates | `identity verification and mandate verification are independent: ...zero mandates` |
| The inverse holds too: a verified mandate with zero identity verification | `the inverse also holds: a lister can have a verified mandate while NOT identity-verified` |
| Mandate is per-property, not per-lister | `mandate is per-property, not per-lister: ...property A does not cover property B` |
| `property_owner` publishes without any mandate row | `canPublish` → `property_owner CAN publish without any mandate row` |
| `broker_agent` without a verified mandate cannot publish | `canPublish` → `broker_agent WITHOUT a verified mandate CANNOT publish` |
| `broker_agent` with a verified mandate for that exact property can publish | `canPublish` → `broker_agent WITH a verified mandate ... CAN publish` |
| A rejected (not just absent) mandate still blocks publish | `canPublish` → `property_mgmt_company WITH a REJECTED mandate CANNOT publish` |

**Deliberately deferred** (belongs to later stages per the Implementation
Prompt Pack): the actual `listing.publicationState` transition logic that
*calls* `canPublish` (Stage 5, Listings module); screening (Stage 6, this is
identity-only, not the tenant screening pipeline); any HTTP controllers/API
routes exposing these services (no document in this stage set calls for
routes yet — Stages 0–4 are deliberately API-light per the Implementation
Prompt Pack's own Stage 1 scope, which lists tests, not endpoints, as the
deliverable).

No SSOT conflict encountered in Stage 1.

---

## Stage 2 — The double-entry ledger

Built as `backend/src/ledger/`:

- **`LedgerService`** — `post()` is the single choke point through which
  every ledger write passes. It calls `validate()` first, which rejects
  (before any row is written): postings with fewer than two legs, any leg
  with `amount <= 0`, and any posting where `sum(debits) !== sum(credits)`.
  All arithmetic is `bigint`; no float appears anywhere in the file. Also
  provides `reverse()` (corrections are new opposite-direction postings,
  never edits), `balanceOf()`, `balancesByTypeForDeal()`, and
  `everyPostingBalances()` (a global integrity check used by tests and,
  later, Stage 4 reconciliation).
- **`EscrowService`** — the canonical postings from Data_Model.md §8.2:
  `fundEscrow` (debit psp_clearing / credit escrow_liability — **no revenue
  account touched**), `recogniseCommission` (debit escrow_liability / credit
  commission_revenue), `settle` (debit escrow_liability / credit
  landlord_payable), `releaseToLandlord` (debit landlord_payable / credit
  psp_clearing), and `refund` (debit escrow_liability / credit
  psp_clearing).

  **Product-agnostic by construction:** every method takes an explicit
  `amount`. Nothing here computes a commission, reads a rent, or knows what
  a listing is — the commission *figure* is computed by Deals (Stage 3)
  from the deal's snapshots and handed in. This is what keeps Payments
  reusable across Natural Intellects products (SSOT §5 rule 8).

  **Sequencing is deliberately NOT enforced here.** The rule that funds
  cannot be released before move-in is a property of the deal state
  machine's transition graph (Stage 3) — there is no `escrow_funded →
  settled` edge. These primitives are the mechanism; the guarantee is the
  shape of the graph that calls them.

**Acceptance criteria and the tests proving them** (`src/ledger/ledger.spec.ts`, 16 tests, all passing):

| Acceptance criterion | Test |
|---|---|
| Unbalanced postings are rejected, and write nothing | `an unbalanced posting is REJECTED and writes nothing` (off by one shilling; asserts zero rows after) |
| Non-positive amounts rejected (direction carries the sign) | `a zero or negative leg amount is REJECTED` |
| Double-entry requires ≥ 2 legs | `a single-leg posting is REJECTED` |
| The ledger always balances (property-tested) | `property test (2000 cases)` — tests `validate()` directly across 2000 randomised multi-leg shapes, asserting balanced ones pass and every one-shilling perturbation is rejected |
| Randomised postings genuinely persist and still balance | `property test (persisted, 25 cases)` — asserts 25 distinct postings committed and accounts net to the exact expected total |
| **Escrow inflow creates a LIABILITY and NO revenue** | `fundEscrow credits escrow_liability and touches NO revenue account` (asserts zero rows on any commission_revenue account) |
| Large multi-month upfront still creates zero revenue | `funding a large multi-month upfront still creates zero revenue` |
| **Commission revenue is recognised only at the recognise step** | `revenue is zero after funding, and exactly the commission after recognising` |
| Recognise is the *only* posting that credits revenue | `the recognise posting is the only one that credits revenue` (runs the full fund→recognise→settle→release path, asserts exactly one revenue entry) |
| The full settlement path nets out correctly | `fund → recognise → settle → release leaves liability zero, revenue = commission, psp net = landlord payout` |
| **A refund fully unwinds a held escrow** | `a pre-move-in refund returns the full held amount and leaves zero liability and zero revenue` |
| **No operation mutates a posted entry** | `no ledger operation mutates a posted entry — the DB rejects UPDATE and DELETE` (asserts the row is byte-identical after both attempts) |
| Corrections are reversing postings, not edits | `reverse() writes an opposite-direction posting and nets the accounts back to zero` (asserts 4 rows exist — originals preserved, not erased) |
| Money is integer shillings, no float precision loss | `amounts round-trip as bigint with no float precision loss at large values` (uses 2^53 + 1, beyond IEEE-754 safe range) |
| Postings are atomic with the caller's transaction | `a posting made inside a caller transaction ROLLS BACK with it` and `... that COMMITS is persisted` |

**A real bug these tests caught.** The two atomicity tests initially
deadlocked, exposing that `EscrowService.accountFor()` (and
`LedgerService.reverse()`'s read) used the base Prisma client even when the
caller supplied a transaction client. Beyond the deadlock, that was a
correctness defect: a ledger account created outside the caller's
transaction would have survived a rollback that discarded the postings
referencing it, and `reverse()` could read a pre-transaction snapshot.
Both now take and honour the transaction client. This is exactly the class
of bug Technical Architecture §8 (one transaction spanning ledger posting
and state change) exists to prevent, and it would have been invisible
without an explicit rollback test.

**A test-hygiene fix, also caught here.** The Stage 0 immutability test
wrote a *single-leg* `ledger_entry` directly (it only needed some row to
attempt UPDATE/DELETE against). Because those rows are immutable by design,
each run left permanent unbalanced-posting debris that broke
`everyPostingBalances()` globally. It now writes a balanced pair. The dev
database was reset once to clear the accumulated debris; the full suite has
since run repeatedly with no cross-run pollution.

**Deliberately deferred to later stages:** the deal state machine and the
sequencing/guarantee it enforces (Stage 3); the commission *computation*
from deal snapshots (Stage 3); the `PaymentProvider` interface, mock PSP,
`psp_instruction` idempotency, and `reconciliation_check` (Stage 4). No
HTTP routes.

No SSOT conflict encountered in Stage 2.

---

## Stage 3 — Deal state machine & commission engine

Built as `backend/src/deals/`:

- **`deal-state-machine.ts`** — `ALLOWED_TRANSITIONS` is a direct,
  line-by-line encoding of the Data_Model.md §7.3 table, `Object.freeze`d so
  the graph cannot be mutated at runtime. Only edges appearing there are
  legal; everything else throws `IllegalTransitionError` (FR-8.1).
- **`commission.ts`** — `computeCommission()` is a **pure function over the
  deal's own snapshots**. It has no access to a live rate, a listing, or an
  escrow total, so the two most expensive money bugs available here —
  computing commission from the escrow inflow (Decision 5) or reading the
  current rate at settlement (FR-7.4) — are impossible by signature, not by
  discipline. Integer `bigint` arithmetic throughout; truncation resolves
  fractional shillings in the payer's favour.
- **`deals.service.ts`** — one named business method per transition (there
  is deliberately **no** generic `setStatus()`, which would let callers route
  around the guards). Every transition writes the status change, an
  immutable `deal_transition` audit row, and any ledger effect inside **one
  database transaction**, so money state and deal state cannot diverge.

### ✅ RESOLVED — Data_Model.md §7.3, Amendment A1 (ruled 2026-07-27)

§7.3's transition table contradicts itself about whether a **funded** deal
can be cancelled:

- **Row 8** lists `escrow_funded` in the "From" column for `cancelled` — but
  that same row's guard text reads *"pre-funding cancel; if funded → must
  route via refunded"*, which forbids exactly that transition.
- **§7.3's closing paragraph** states as a structural fact: *"The only exits
  from `escrow_funded` are `move_in_confirmed` (forward) or `refunded`
  (money back)."*

These cannot both hold. Allowing `escrow_funded → cancelled` would let a
funded deal reach a **terminal** state with no refund posting — held client
money stranded, and the Move-In Guarantee broken.

**Ruling (Stage 4 review, 2026-07-27): the strict reading is confirmed.** A
funded deal can never be cancelled; it exits only via `move_in_confirmed` or
`refunded`. `Data_Model.md` §7.3 has been amended — `escrow_funded` struck
from the `cancelled` row's "From" column, with the reasoning recorded there
as **Amendment A1**. The implementation already matched, so no code change
accompanied the ruling; the edge's absence is asserted by test and the
ruling is recorded in code as `ESCROW_FUNDED_CANCEL_RULING`.

### Acceptance criteria and the tests proving them

Pure-function suites (`commission.spec.ts` 7 tests, `deal-state-machine.spec.ts` 19 tests) and an integration suite (`deals.service.spec.ts` 16 tests) — 42 tests, all passing.

| Acceptance criterion | Test |
|---|---|
| **Rate frozen at signing, immune to later changes** | `a new commission_rate_version created AFTER signing does not re-price the deal` — doubles the standard rate mid-deal, asserts the deal still earns at the old rate |
| Listing edits also cannot re-price a signed deal | `editing the LISTING rent after signing does not re-price the deal either` — triples the listing rent, commission unchanged |
| Snapshots cannot be re-taken | `snapshots cannot be re-taken — signing twice is rejected` |
| **Commission uses monthly rent, not the escrow total** | `a 12-month upfront payment yields the SAME commission as a 3-month one` — 4,000,000 vs 13,000,000 into escrow, identical 1,000,000 commission |
| The engine cannot see the escrow total at all | `THE Decision 5 property: commission is invariant to the upfront amount` |
| **Commission recognised exactly at move-in** | `no revenue exists at any point before the commission_earned transition` — asserts zero revenue after *each* of created/matched/signed/funded/moved-in, then non-zero only after the earn step |
| Exactly one revenue posting | `the earn transition posts exactly one recognise_commission entry` |
| **No code path releases funds before move-in** | `settle() on a funded (not moved-in) deal is REJECTED and moves no money` — asserts ledger balances are byte-identical before/after |
| The guarantee edge is absent from the graph | `there is NO escrow_funded → settled transition` and `the ONLY value-moving exits from escrow_funded are move_in_confirmed and refunded` |
| Settlement is reachable only via move-in | `settlement is reachable ONLY via move_in_confirmed → commission_earned` |
| The graph cannot be mutated to re-add the edge | `the table is frozen at runtime` |
| A funded deal cannot be cancelled (see ambiguity above) | `a funded deal CANNOT be cancelled — money must route via refund` |
| Refund returns everything and earns nothing | `refund from escrow_funded returns the full amount and earns nothing` |
| **Illegal transitions rejected, leaving no trace** | `a rejected transition writes no deal_transition row and does not change status` |
| Every legal transition is audited immutably | `every legal transition writes exactly one immutable audit row` — asserts the exact from/to sequence, then that the row rejects UPDATE |
| Happy path settles net of commission | `landlord receives upfront − commission; ledger fully discharged` |
| No step of the happy path can be skipped or reversed | `the happy path cannot be short-circuited` / `no backward transition ... is permitted` |

### Test-infrastructure change

`maxWorkers: 1` is now set in the Jest config. The suites pass individually
but failed when run together: Jest's parallel workers exceed what this
sandbox's WASM Postgres server tolerates, producing connection errors that
look like test failures but are not. Setting it in the config (rather than
only in the npm script) means a bare `npx jest` is correct too. **This is an
environment constraint, not a property of the code** — against a real
PostgreSQL server the suites can run in parallel.

Full suite: **80/80 passing**, stable across repeated runs; `tsc --noEmit`
clean.

**Deliberately deferred to Stage 4:** the `PaymentProvider` interface and
mock PSP, `psp_instruction` idempotency, timeout auto-release, and
`reconciliation_check`. `DealsService.settle()` currently posts both the
settle and release legs directly; Stage 4 will route the release through the
provider. No HTTP routes.

---

## Stage 4 — Payments abstraction & escrow orchestration

Built as `backend/src/payments/`, plus orchestration changes in
`DealsService`:

- **`PaymentProvider` interface** — `collectToEscrow` / `releaseTo` /
  `refund` / `status` / `custodianBalance`. Every method issues an
  *instruction to a third party that holds the money*; nothing in the
  interface can be read as our own account holding funds (FR-7.1).
  Expressed in payer/payee/amount/reference terms with no "rent",
  "commission", "landlord" or "listing" anywhere, so Smart Ride could
  implement against it unchanged (SSOT §5 rule 8).
- **`MockPaymentProvider`** — a real test double, not a stub that always
  says yes: it enforces idempotency by key (returning the *original* result
  flagged `deduplicated`), fails deterministically for references containing
  `-fail`, and tracks a custodian balance that actually moves, so
  reconciliation is tested against something real rather than a constant.
- **`PaymentsService`** — owns the `psp_instruction` boundary. Deduplicates
  on our side of the boundary as well as the provider's, so we are safe even
  against a provider that handles keys badly. **Deliberately does not post to
  the ledger** — ledger effects belong to the deal transition that authorised
  them, inside that transition's transaction; posting here too would
  double-count.

### Schema change: `psp_instruction` immutability (resolved by your ruling)

Data_Model.md marks `psp_instruction` 🔒 immutable, but its `state` column
defaults to `pending` and must become `succeeded`/`failed`. With the Stage 0
trigger in place this was verified impossible — an UPDATE is rejected — which
blocked Stage 4.

Resolved (your decision) by **event sourcing**: `psp_instruction` stays fully
immutable, and a new append-only `psp_instruction_event` table records each
state change. Current state is *derived* from the latest event. The
instruction's `amount`, `kind` and `idempotency_key` therefore remain
un-editable after the fact, which is the entire point of marking a money
boundary immutable. The `updated_at` column was also dropped from
`psp_instruction` — it was incoherent on an immutable table. The new table
carries the same `reject_mutation()` trigger. Migration
`20260727170000_psp_instruction_events`.

### Settlement ordering — PSP call outside the transaction

`settle()` and `refund()` issue the custodian instruction **before** opening
the DB transaction, not inside it. Holding a transaction open across a
network call would hold locks for its duration and, worse, allow the
transaction to roll back *after real money had moved at the custodian*,
leaving our books denying a payout the landlord actually received. Instead:
issue the instruction (idempotent, recorded immutably) → only if the
custodian accepted, atomically post the ledger effect and flip the status.
If the second step fails, the deal stays at `commission_earned` and a retry
re-issues under the **same deterministic idempotency key**
(`settle:<dealId>` / `refund:<dealId>`), so the custodian cannot pay twice
and the discrepancy is visible to reconciliation meanwhile.

### Timeout auto-release — mechanism built, policy left as config

`findEscrowFundedBeyond({ windowDays })` returns candidate deals rather than
acting on them. PRD §7 explicitly lists *"refund/timeout timing specifics"*
among unresolved open items, describing them as **"configuration or an
ops-policy value, not a design choice"**. Inventing a window, or
auto-refunding money on a schedule nobody has agreed, would be exactly the
silent business-rule invention this build exists to avoid. The mechanism is
testable now and the policy plugs in as configuration; any actual money
movement still goes through `refund()`, keeping the ledger and the guarantee
intact. Funded-at is read from the immutable transition history, not a
mutable `updatedAt`.

### Acceptance criteria and the tests proving them

`payments.service.spec.ts` (14 tests) and `deals-orchestration.spec.ts` (10 tests).

| Acceptance criterion | Test |
|---|---|
| **Provider is swappable behind the interface** | `a completely different PaymentProvider implementation can be substituted` — injects an entirely separate implementation via the DI token and asserts it is the one called |
| No code assumes we hold the funds | `every provider method is an instruction to a third party, with a provider reference back` |
| **Full happy path posts correctly end-to-end** | `fund → move-in → earn → settle (via PSP) → close posts correctly throughout` — asserts the release instruction exists, is for `upfront − commission`, and that liability and payable both discharge to zero |
| **Pre-move-in refund returns tenant funds fully** | `refund issues a PSP instruction, unwinds the liability, and earns nothing` |
| **A duplicated PSP call does not double-post** | `issuing twice with the same key creates ONE instruction and does not re-charge`; `a duplicated fund call does not double-post to the ledger`; `a replayed provider callback does not create a second event` |
| A retried settlement cannot pay twice | `calling settle() again after success is rejected by the state machine, and issues no second instruction` — asserts one instruction, unchanged custodian balance, and no second ledger posting |
| A retried refund cannot refund twice | `a retried refund does not refund twice` |
| A failed custodian release does not advance the deal | `when the provider declines, the deal stays at commission_earned and no money moves` — asserts the full ledger balance map is unchanged |
| **Ledger reconciles to PSP state** | `a reconciliation check records both balances and whether they agree` |
| A divergence is surfaced, not absorbed | `a DIVERGENCE is surfaced, not silently absorbed`; `the ledger is authoritative: a custodian mismatch does not alter ledger state` |
| `psp_instruction` remains fully immutable | `the instruction row itself rejects UPDATE and DELETE`; `lifecycle events are append-only and also reject mutation` |
| State is derived, not stored | `current state is derived from the latest event, not stored on the row` |
| Timeout mechanism works, policy is caller-supplied | `a deal funded longer ago than the window is returned as a candidate` (+ two negative cases) |

Full suite: **104/104 passing** across 9 suites, stable across repeated runs;
`tsc --noEmit` clean; the app boots with all six modules wiring correctly.

**Deferred (correctly, outside Stage 0–4 scope):** HTTP routes and the
authorisation matrix (the API spec is document 4, not yet written); Config
module wiring for the timeout window; everything in Stages 5–8.

No SSOT conflict encountered in Stage 4. The §7.3 `escrow_funded → cancelled`
ambiguity raised at Checkpoint 3 was **ruled at Stage 4 review** and is now
Amendment A1 in `Data_Model.md` — the strict reading, confirmed.

---

## Stage 5 — Listings, search, availability

Three modules: `backend/src/config/`, `backend/src/listings/`,
`backend/src/search/`.

### Config module (built here because Stage 5 is the first consumer)

`ConfigService` serves versioned, effective-dated parameters
(Data_Model.md §3.1). Two deliberate properties:

- **A future-dated version is invisible until its effective date**, so a
  scheduled change can be staged in advance without taking effect early.
- **Reading an unset parameter THROWS rather than returning a default.** A
  silent fallback is how an unvalidated business parameter (PRD §1.5)
  becomes permanent without anyone deciding it. Callers must seed values
  explicitly.

Money-touching config stays out: the commission rate has its own
`commission_rate_version` table and is consumed by *snapshot*, never by live
lookup — that separation is what makes in-flight deals immune to a rate
change, and merging the two would quietly destroy it.

### Listings

`ListingsService.publish()` is **the gate**. All three preconditions are
enforced server-side, so no client can route around them:

1. `verificationState === 'verified'` (FR-3.1)
2. the property's neighbourhood is `inServiceArea` (FR-2.5)
3. for `broker_agent` / `property_mgmt_company` listers, a verified
   per-property mandate — delegated to `MandateService.canPublish()` from
   Stage 1 rather than reimplemented, so the rule lives with the
   verification data (FR-3.2)

**Staleness is computed, never stored** (FR-2.3). Storing it would freeze
yesterday's policy into the data and make a window change require a
backfill. A listing whose availability was *never* confirmed is treated as
stale — absence of evidence is not evidence of availability, and the whole
proposition is that a live listing is genuinely available.

### Search

Three constraints apply regardless of filters, because they are what the
public feed *means*: `live` + `verified` + `inServiceArea`. `filters` can
only narrow, never widen past them. Stale listings are excluded by default
and opt-in only. Results are ordered freshest-first — the most recently
confirmed listing is the one a tenant is least likely to waste a trip on.

Trust signals (`isVerified`, `daysSinceConfirmed`, `isStale`,
`freeForTenants`) are returned as **data** (FR-4.2). The client renders
them and cannot fabricate them; "verified" means something only if the
server is the one asserting it. `freeForTenants` is asserted server-side
rather than being client copy that could drift from Decision 3.

### Acceptance criteria and the tests proving them

`listings.spec.ts` (18 tests) and `search.spec.ts` (14 tests) — 32 tests.

| Acceptance criterion | Test |
|---|---|
| **Out-of-service-area listings are excluded** | `an out-of-service-area listing CANNOT be published`; `an OUT-OF-CORRIDOR listing is never returned` (forces `live` first, proving search excludes it independently of publish) |
| Adding a corridor is a data change, not a code change | `adding a corridor is a DATA change — flipping the flag makes the same listing publishable` |
| **Unmandated broker listing is unpublishable** | `an unmandated BROKER listing cannot be published`; same for management companies; `a broker mandated on ANOTHER property still cannot publish this one` |
| Property owners need no mandate | `a PROPERTY OWNER publishes with no mandate at all` |
| Unverified listings cannot publish or appear | `an unverified listing CANNOT be published`; `an UNVERIFIED listing is never returned, even if forced live` |
| **Stale availability is detectable and filterable** | `a listing confirmed beyond the window is excluded`; `...but is returned when the caller explicitly opts in, flagged as stale` |
| Freshness window is genuinely configuration | `THE config test: widening the window makes the SAME listing fresh again, with no data change` — asserts the row is byte-identical and only the answer changes |
| Never-confirmed listings are stale | `a listing whose availability was NEVER confirmed is stale` (+ the search-side equivalent) |
| **No street address required** | `a listing publishes with neighbourhood + landmark and NO street address` |
| Money is integer shillings | `monthly rent and deposit round-trip as bigint` |
| Trust signals are data, not copy | `each result carries verified, freshness and free-for-tenants as fields` |
| Honest empty states | `a zero-result search explains ongoing verification, not failure` — asserts the message mentions verification and contains no "error/sorry/failed" |
| Field summary comes from structured data | `the summary projects structured fields, not free text`; `a listing with no field report yet returns null, not a fabricated summary` |
| Config refuses to invent parameters | `reading an unset parameter THROWS rather than silently defaulting`; `a future-dated version is invisible until its effective date`; `config versions are immutable` |

Full suite: **136/136 passing** across 11 suites; `tsc --noEmit` clean; app
boots with all nine modules wired.

**Deliberately deferred:** HTTP routes (no API spec exists yet); media
upload (Stage 7); the viewing/introduction/field-report *write* flow (Stage
7 — Stage 5 only reads the field report for FR-4.3); amenity seeding.

No SSOT conflict encountered in Stage 5.

---

## Stage 6 — Modular screening pipeline & tenant onboarding

Built as `backend/src/screening/`.

### The pipeline (FR-6.1, FR-6.2)

`ScreeningModule` is a one-method contract (`run(context) → outcome`).
Modules are **registered** in `screening.module.ts`; which ones **run** comes
from the `screening_modules` config value at runtime. That split is the
entire seam: adding employment / references / rental-history / risk-scoring
later is a new class plus a config edit, and `runScreening()` — the whole of
the tenant-facing screening flow — does not change, nor does anything
calling it.

Modules deliberately cannot: write their own result rows, decide the overall
verdict, or see each other. Keeping that authority in the pipeline is what
stops a future module quietly changing how screening behaves as a whole.

**V1 config is `['identity']`.** `IdentityScreeningModule` delegates entirely
to the Stage 1 `IdentityService` rather than reimplementing the three-factor
check — screening asks the question, Identity owns the answer, so the rule
cannot drift between two copies.

**`EmploymentStubModule` is registered and inert.** It collects and stores
nothing; employment verification is post-V1 (SSOT §6) and building any part
of it now would be scaffolding a deferred feature. It exists solely to make
the seam demonstrable.

### Three conservative choices worth noting

1. **A configured-but-unregistered module throws** rather than being skipped.
   Silently ignoring it would mean a tenant "passed" a check nobody ran.
   The resolve-then-run ordering means an unknown key aborts *before* any
   `screening_run` row is written.
2. **An empty pipeline resolves to `pending`, never `passed`.** "No checks
   ran" must never read as "cleared".
3. **`skipped` does not block a pass, but never counts as one.** A module can
   legitimately not apply without that being treated as a positive result.

### Onboarding (FR-1.4, FR-6.3)

`registerTenant()` creates the party, its tenant `user_account`, and the
consent record in one step, so a tenant cannot exist in a state where
verification was attempted without consent behind it. `IdentityService`
independently refuses to verify without a consent row, so the ordering is
enforced twice rather than merely intended.

`tenantSummary()` — what a landlord-facing surface reads — returns a
*verdict*, not PII: identity-verified yes/no, screening state, which modules
ran, and consent/retention metadata. The landlord's assurance is
"government-identified and escrow-funded", which needs no personal data
disclosure.

### Acceptance criteria and the tests proving them

`screening.spec.ts` — 17 tests.

| Acceptance criterion | Test |
|---|---|
| **Identity-only config runs only identity** | `with config = ["identity"], ONLY the identity module runs` |
| **Enabling a module needs no tenant-flow change** | `enabling it by config ALONE changes behaviour — the tenant flow code is untouched` — makes the identical call before and after, changing only config |
| The stub is present but inert under V1 config | `the stub module is REGISTERED but does not run under V1 config` |
| Adding a module needs no schema change | same test — the new `module_key` row persists against the existing tables |
| Run history stays interpretable after a config change | `the run snapshots WHICH modules ran` |
| Unknown modules fail loudly, not silently | `a configured-but-unregistered module FAILS LOUDLY`; `an unknown module aborts BEFORE any run row is written` |
| **No financial documents collected or stored** | `no financial or employment document is collected or stored anywhere` — greps the serialised run for payslip/bankStatement/salary/employerName/reference |
| No raw PII in screening results | `the screening result carries no raw personal data` — asserts the NIN never appears |
| Consent recorded with purpose + timestamp + retention | `onboarding records consent with purpose, timestamp and policy version` |
| Verification refused without consent | `identity verification is refused for a party with no consent record` |
| Partial verification fails | `a partially verified tenant (2 of 3 factors) still FAILS`; `a tenant whose selfie match FAILS is not identity-verified` |
| Empty pipeline never reads as cleared | `"no checks ran" resolves to pending, never to passed` |

**The seam test was verified to be load-bearing**: temporarily hardcoding the
module set to ignore config failed exactly the five tests that assert
config-driven behaviour, including the FR-6.2 seam test by name. A test that
cannot fail proves nothing, so this was checked rather than assumed.

A schema-wide grep confirms no `payslip` / `bank_statement` / `salary` /
`employer` / `income` column exists anywhere (FR-6.3).

Full suite: **153/153 passing** across 12 suites; `tsc --noEmit` clean; app
boots with all ten modules.

**Deliberately deferred:** HTTP routes; the viewing/field-report write flow
and media pipeline (Stage 7); real employment/reference verification
(post-V1).

No SSOT conflict encountered in Stage 6.

---

## API layer — document 4 implemented (auth, guards, controllers)

Built between Stages 6 and 7, because **NFR-1 was unenforced**: there were
no endpoints, so nothing prevented cross-role access to money and
state-transition operations. Every test to that point called services
directly, as a trusted caller. Stages 7-8 both assume an API exists, and
Stage 8's acceptance criteria name authz explicitly.

`docs/House_For_Rent_API_Specification.md` was written first, completing the
four-document set per the Data Model §13 handoff.

### What was built

- **Auth** (`src/auth/`) — register / login / refresh / logout, plus
  admin-only staff provisioning. Refresh tokens are stored as SHA-256
  hashes and **rotated** on use: a stolen token works at most once, and its
  use invalidates the legitimate session, which surfaces the compromise
  rather than letting it persist. Login compares against a dummy hash when
  the account is absent, so a missing phone number and a wrong password
  take indistinguishable time.
- **`user_credential` table** — Data_Model.md §2.2 deliberately modelled no
  password columns, noting "credentials handled by auth subsystem" and
  leaving the shape to document 4. Kept separate from `user_account` so
  reading an account (every authorised request) never loads the hash.
- **Global guards** — `JwtAuthGuard` + `RolesGuard` registered via
  `APP_GUARD`, so endpoints are **protected by default** and must opt out
  with `@Public()`. Per-controller registration fails open: a new
  controller written without the decorator would be silently
  unauthenticated and no test would notice.
- **`DealPartyGuard`** — being a tenant is not enough; being that specific
  deal's tenant is required. Non-parties receive **404, not 403**, because
  403 confirms the deal exists and enables ID enumeration.
- **Global `ValidationPipe`** with `forbidNonWhitelisted`, so a body
  carrying `status`, `commissionAmount` or `actorPartyId` is a 400 rather
  than a silently ignored field.
- **`BigIntSerializerInterceptor`** — money leaves as strings globally. Per
  endpoint mapping would work until the first handler that forgets, and
  that failure is silent, plausible-looking, and about money.
- **`DomainExceptionFilter`** — maps domain errors to documented status
  codes. Without it every rejected transition is a 500, which is both wrong
  and dangerous: monitoring could not distinguish "a tenant tried something
  illegal" from "the ledger is broken". Unrecognised errors fall through to
  500 **without echoing their message**.
- **Controllers** — deals (all 11 transitions), listings, search.

### The role assignments that carry weight

| Decision | Reasoning |
|---|---|
| `earn-commission` and `settle` are **admin-only** | Exposing settle to a landlord lets the beneficiary trigger their own payout; exposing earn-commission to a tenant lets them create revenue |
| **The tenant** confirms move-in, not the landlord | It releases the tenant's own money from protection, so the party at risk states the condition is met |
| `verify` is **FOO-only** | A lister verifying their own property dissolves the entire trust proposition |
| A FOO — though staff — **cannot move money** | Field authority and financial authority are separate |
| `publish` is lister-callable | Not a hole: the service independently re-checks verification, service area and mandate, so an unverified listing gets 422 |

### Acceptance criteria and the tests proving them

`authorization-matrix.spec.ts` — 68 tests.

| Criterion | Test |
|---|---|
| **Every cell of the §4 matrix** | `matrixRow()` asserts, for all four roles on ten transition endpoints, that permitted roles are not blocked and denied roles get 403 with `FORBIDDEN_ROLE` |
| Money endpoints deny cross-role access | `a tenant CANNOT settle`; `a LISTER cannot settle their own deal`; `a lister cannot earn commission on their own deal`; `a FOO — who is staff — still cannot move money` |
| Authentication is required | `an unauthenticated request to a money endpoint is 401`; `a garbage bearer token is 401, not a crash` |
| Role alone is insufficient | `a tenant CANNOT fund a stranger deal, and gets 404 not 403` |
| Existence is not disclosed | `a non-existent deal returns the SAME 404 as a stranger deal` |
| Privileged fields cannot be smuggled | bodies carrying `status`, `commissionAmount`, `actorPartyId` all 400 |
| Money must be a string | `money as a JSON NUMBER is rejected`; `a non-numeric amount string is rejected` |
| **Forbidden endpoints do not exist** | `there is NO generic status-patching endpoint`; `NO settle-from-funded shortcut`; `NO ledger-write endpoint at any role, including admin` |
| Staff cannot self-register | registering as `admin` or `foo` is a 400; a tenant cannot provision staff |
| A lister cannot self-verify | `THE KEY ONE: a lister CANNOT verify their own listing` |
| Publish gates hold behind authz | `a lister publishing an UNVERIFIED listing gets 422, not 200` |

**The matrix tests were verified to be load-bearing**: disabling the role
check in `RolesGuard` failed exactly 30 of 60 — precisely the denial half —
then restored. A permission test that passes with authz switched off proves
nothing.

Full suite: **221/221 passing** across 13 suites; `tsc --noEmit` clean; 26
routes mapped and the app boots.

**Deferred:** viewing/field-report endpoints and the media pipeline (Stage
7); admin observability endpoints — reconciliation, launch gate,
verification queue (Stage 8); rate limiting; the idempotency middleware
(`settle`/`refund` already derive deterministic server-side keys, so
retries are safe today, but the `Idempotency-Key` header is not yet read).

---

## Stage 7 — Field Operations Officer workflow

Two modules: `backend/src/viewings/` and `backend/src/media/`.

### THE invariant, and where it actually lives

Data_Model.md §5.1 states it as a requirement on document 4:

> *"[Invariant, for document 4] A `viewing` cannot move to `conducted`
> without (a) an `introduction_record` and (b) a `field_report` (FR-5.3,
> FR-5.4)."*

It is enforced **twice**, deliberately:

1. `ViewingsService.conduct()` refuses without a field report, then writes
   the introduction record and the status change in one transaction.
2. A **database trigger** (`viewing_conducted_requires_evidence`, migration
   `20260730120000_conducted_viewing_evidence`) rejects any INSERT or UPDATE
   setting `status = 'conducted'` unless both rows already exist for that
   viewing.

The second exists for the same reason the 🔒 immutability triggers do: an
introduction record is **evidence**. If any path that bypasses the service —
a manual fix, an ad-hoc script, a future bug, a test fixture — can produce a
`conducted` viewing with nothing behind it, then "every conducted viewing
produced an introduction record" stops being a fact about the data and
becomes a fact about one code path. The circumvention clause is only
enforceable if it is the former.

**This was not theoretical.** The whole-table invariant test failed on its
first run, finding `conducted` viewings with no field report — created
directly by the Stage 3/4 test fixtures (`deals.service.spec.ts`,
`deals-orchestration.spec.ts`, `search.spec.ts`, `immutability.spec.ts`),
which had been constructing a state production code can never reach. All
four fixtures were rewritten to build evidence first and flip status last;
the migration demotes (never deletes) any pre-existing violating row before
the trigger takes effect.

### Ordering: field report first, then conduct

§4.3 lists `field-report` and `conduct` as separate endpoints, and there is
no introduction-record endpoint at all. The only coherent composition is:
the report is filed against a `scheduled` viewing, and `conduct` is the
closing operation that requires it, mints the introduction record, and flips
the status. `conduct` therefore takes no report in its body — which also
means the "cannot close without a report" test is meaningful rather than
tautological.

### The write-back: a field report is not just a record

Filing a report updates the listing in the same transaction (FR-5.4 AC,
Data_Model.md §5.3):

- **availability + freshness clock**, from `isAvailable`. The clock is
  refreshed *either way* — a visit is a visit; what changed is the answer,
  not our confidence in its age (FR-2.3).
- **verification state**, from `matchesListing`. A report matching the
  listing verifies it; one finding it inaccurate *removes* its verified
  standing, so it cannot be re-published on the strength of a check that has
  since been contradicted. This is what makes FR-5.5's "verification
  originates from a field visit" true rather than merely intended.

It deliberately does **not** auto-withdraw a live-but-inaccurate listing.
Withdrawing inventory is an ops decision nobody has taken; inventing one
here would be exactly the silent business-rule invention this build avoids
(same posture as Stage 4's timeout window). An admin or FOO calls
`withdraw()`.

### Media: interface + mock, policy on our side of the boundary

`MediaStorageProvider` follows the `PaymentProvider` / `IdentityProvider`
pattern — bound by DI token, no storage vendor named anywhere in the domain.
The **compression policy** (a three-rung ladder with byte ceilings, the
accepted MIME set, the source ceiling) lives in `MediaService`, not the
provider, so swapping the storage backend cannot silently change what "low
bandwidth" means (NFR-5).

Two properties worth naming:

- The ladder is a **post-condition, not a promise**: after the provider
  returns, every rung is checked against its ceiling, and an oversized one
  is a `502`, not a quietly-served unusable file.
- `forBandwidth()` returns the **smallest** rung when nothing fits, never
  null. A thumbnail beats a broken image.

No schema change was needed: `media_asset` is written with exactly the
columns Data_Model.md §10.1 specifies, and the variant ladder is resolved
through the provider from `storage_ref`.

### ✅ FLAGGED — PRD FR-5.1 AC vs Data_Model.md §5.1 (resolved, no amendment)

FR-5.1's AC reads *"a viewing request creates a **scheduled** viewing tied to
tenant + property + time"*, while Data_Model.md §5.1 defaults `status` to
`'requested'` and API Spec §4.3 has a separate `assign` endpoint.

Taken literally, `requested` would be a state nothing ever enters and
`assign` a near no-op — making the schema incoherent. **Resolved as prose,
not a status literal:** the AC's own enumeration is "tenant + property +
**time**", about the linkage rather than the enum value. Implemented as
`request → requested`, `assign → scheduled`. Raised with the user before
building rather than silently resolved; no doc amendment was needed because
neither document changes meaning under this reading.

### Amendment A2 — API Spec §4.3 extended

§4.3 listed no media endpoint despite FR-5.5 mandating field media capture,
and §11 did not list media among the deliberate absences — a gap, not a
prohibition. `POST /viewings/{id}/media` was added under the same ¹
assigned-FOO constraint, plus two staff-only reads (`GET
/viewings/assigned/me`, `GET /viewings/introductions`). Recorded in
`House_For_Rent_API_Specification.md` §4.3 as Amendment A2.

### The authz decisions that carry weight

| Decision | Reasoning |
|---|---|
| `assign` is **admin-only** | An officer who could assign themselves would make the corridor and workload controls advisory |
| `conduct` / `field-report` / `media` require the **assigned** FOO | Both are evidence; evidence signed by an officer who was never dispatched is worse than none |
| A non-assigned FOO gets **403, not 404** | Unlike §7.4's deal guard, every caller here is already staff with system-wide visibility. Concealing existence buys nothing and costs a dispatched officer a baffling error |
| `GET /viewings/introductions` is **staff-only** | It is a linkage between two counterparties; exposing it to either tells a landlord which other tenants an officer introduced |
| **No** introduction-record endpoint exists | The record is a consequence of conducting, never independently creatable — otherwise an introduction could be fabricated for a visit that never happened |

### Acceptance criteria and the tests proving them

`viewings.spec.ts` (40 tests) plus 35 new cells in
`authorization-matrix.spec.ts`.

| Acceptance criterion | Test |
|---|---|
| **No viewing closes without a report + introduction record** | `conduct() WITHOUT a field report is REJECTED`; `a rejected conduct leaves NO trace: still scheduled, no introduction record`; `with a report filed, conduct() succeeds and mints the introduction record` |
| The invariant holds against the DATABASE, not just the service | `THE DATABASE refuses a conducted viewing with no evidence, even bypassing the service` — asserts both branches of the trigger by writing straight through Prisma |
| It holds table-wide, not just for rows this test made | `no conducted viewing anywhere in the database lacks either artefact` |
| Both artefacts exist the instant the status changes | `BOTH artefacts exist the instant the status is conducted` |
| It holds at the HTTP boundary too | `conduct without a field report is 422 FIELD_REPORT_REQUIRED` |
| A conducted viewing cannot be retroactively denied | `a conducted viewing is TERMINAL — it cannot be reopened as no_show`; `conduct() cannot be replayed to mint a second introduction record` |
| **Availability confirmation flows to listing freshness** | `the report UPDATES AVAILABILITY FRESHNESS (FR-5.4 AC → FR-2.3)` — asserts stale-before / fresh-after with `daysSinceConfirmed === 0` |
| An unavailable finding refreshes the clock too | `a report of NOT available also refreshes the clock, and marks it unavailable` |
| Verification originates from the field visit (FR-5.5) | `a report matching the listing VERIFIES it`; `a report finding the listing INACCURATE removes its verified standing` (then asserts publish is refused) |
| **Introduction records are queryable as evidence** | `the record is QUERYABLE by tenant, by landlord and by listing` |
| The evidence survives with no deal at all | `THE circumvention case: the evidence persists with NO deal ever created` — asserts zero deals, then the linkage still resolves |
| The evidence is immutable and not caller-authored | `the record is IMMUTABLE — the database rejects UPDATE and DELETE`; `the landlord on the record is DERIVED from the property, not supplied` |
| Only verified tenants request viewings | `an UNVERIFIED tenant cannot request a viewing` |
| Dispatch is corridor-bounded | `dispatch is CORRIDOR-BOUNDED: an out-of-corridor viewing cannot be assigned` — publishes in-corridor first, then moves the neighbourhood out, isolating the dispatch check from the publish gate |
| Only real field officers can be assigned | `a party who is NOT a field officer cannot be assigned` |
| No-shows are tracked | `a NO-SHOW is tracked as a status, not deleted` |
| **Media handles low bandwidth** | `EVERY rung honours its byte ceiling`; `GRACEFUL DEGRADATION: a tiny byte budget still yields an image, not a failure` |
| The ceiling check is real, not decorative | `a provider that BREAKS the ceiling is rejected, and no asset row is written` — forces the mock to misbehave |
| Bad captures are refused at the boundary | `an unacceptable MIME type is refused BEFORE any storage call`; `an oversized source is refused at the boundary, not after the upload` |
| Storage is swappable | `the storage backend is genuinely swappable behind the interface` |
| **The partner-viewing seam (FR-5.6)** | `"conducted by" is a role-typed reference, and V1 permits only foo` — queries `enum_range(NULL::"ConductedByRole")` and asserts exactly `['foo']` |
| The transition graph is frozen and correct | `there is NO requested → conducted edge`; `conducted, no_show and cancelled are all terminal`; `the graph is frozen at runtime` |
| **Every cell of the §4.3 matrix** | `viewingRow()` asserts all four roles across five endpoints, plus the `POST /viewings` row |
| Role alone is insufficient (the ¹ footnote) | `an UNASSIGNED foo cannot conduct someone else's viewing` / `...file a field report` / `...capture media`; `the ASSIGNED foo can do all three` |
| Privileged fields cannot be smuggled | `a field report carrying viewingId or fooPartyId is 400`; `a viewing request naming another tenant is 400`; `a conduct call cannot supply its own introducedAt or landlord` |
| **Forbidden endpoints do not exist** | `there is NO endpoint that creates an introduction record directly`; `there is NO cancel endpoint for a viewing`; `introduction evidence is staff-only` |

### Both safeguards were verified load-bearing

- **`AssignedFooGuard`**: disabling the assignment comparison failed exactly
  3 of 103 authz tests — precisely the three ¹-footnote denial cases, and
  nothing else. Restored.
- **The DB trigger**: disabling `conduct()`'s service-layer report check did
  **not** let the invariant break — Postgres rejected the transition with
  `23514 check_violation: no field_report exists`. The test failed only on
  the error *type*, which is the strongest possible result: the guarantee
  survived its service-layer enforcement being removed. Restored.

Full suite: **296/296 passing** across 14 suites; `tsc --noEmit` clean; 34
routes mapped (was 26) and the app boots with all twelve modules.

**Deliberately deferred:** real byte handling (multipart, transcoding) —
the interface + mock is the agreed scope, matching the pack's own guardrail
that real integrations sit behind interfaces; the FOO web console itself
(next); Stage 8's end-to-end integration, circumvention-clause surfacing at
agreement signing, and admin observability.

No SSOT conflict encountered in Stage 7. One PRD-vs-Data-Model tension
(FR-5.1's "scheduled") was flagged and resolved as prose without requiring
an amendment; one API-spec gap was closed as Amendment A2.

---

## Stage 7b — the FOO console (`admin-web/`)

Next.js 16 App Router. Technical Architecture §7 calls for *"web, not mobile,
for V1 — it's an internal ops tool where clarity, form density, and speed
beat native polish"*, with the field-capture parts working *"on a phone
browser with low bandwidth"*.

### It is a thin client, and that is load-bearing

§7 again: *"all money, state, verification, and commission logic is
server-side … It renders server state and issues intent."*

Nothing in `admin-web/` decides whether a viewing may be conducted. The
disabled **Close visit** button renders `canConduct` **as the server
reported it** — which is why `GET /v1/viewings/{id}` returns `canConduct`
and `whatIsMissing` rather than the client deriving them. A rule
re-implemented in the console would be a second copy free to drift from the
two that actually hold (the service and the DB trigger).

Proven by breaking it: forcing `canConduct` true enabled the button, the
browser test failed immediately, **and** the backend still answered
`422 FIELD_REPORT_REQUIRED` when the request went through anyway.

### Two backend additions the console required

| Endpoint | Why |
|---|---|
| `GET /v1/auth/me` | The access token deliberately carries only `sub` — role and party are re-read from the database each request so a role change takes effect immediately. Correct, but it left a client no way to know its own role. Not role-gated: it discloses only what the caller proved by authenticating, and confers nothing. |
| `GET /v1/viewings/{viewingId}` | The field app needs one visit plus whatever evidence it has. Carries the same ¹ assigned-FOO constraint as the writes. Declared *after* the literal `introductions` route, since Nest matches in declaration order — asserted by test. |

### Low bandwidth as a build constraint, not a wish

No component library, no web fonts, no Tailwind. Nearly every page is a
server component shipping no interactive JS; `app/globals.css` is a few
kilobytes of hand-written CSS, cached after first load. The four client
components exist only where a pending state or a file picker genuinely
requires one.

Tokens live in `httpOnly` cookies and are attached **server-side**, so they
never enter the client bundle — an XSS on this console cannot exfiltrate a
field officer's session. The `hfr_role` cookie is deliberately *not*
httpOnly: it picks which links render and nothing else, and the server
re-authorises regardless, so tampering with it changes the menu only.

### Backend error codes are surfaced, not paraphrased

`FIELD_REPORT_REQUIRED` and `NOT_ASSIGNED_FOO` mean very different things to
whoever an officer rings for help. Collapsing them into "something went
wrong" destroys the only diagnostic available from a stairwell with one bar
of signal.

### The browser tests found a real defect

`e2e/field-visit.spec.ts` — 8 Playwright tests against a **real backend and
real database**, nothing mocked, in a Pixel-7 viewport.

Their first run caught that a `'use server'` file **may only export async
functions**: `export const IDLE = { error: null }` broke every Server Action
at runtime while passing both `tsc --noEmit` and `next build`. Silent,
type-clean, and total. Moved to `app/actions/state.ts`; the distinction that
`export type` is safe (erased) while a value is not is now recorded there.

| Acceptance criterion | Test |
|---|---|
| Unauthenticated access is refused | `an unauthenticated officer is sent to sign in` |
| Login does not leak which half was wrong | `bad credentials are refused without saying which part was wrong` |
| An officer sees only their own visits | `the officer signs in and sees only their own assigned visits` |
| **The §5.1 invariant is what the officer SEES** | `THE INVARIANT: a visit cannot be closed until the report is filed` — asserts the button is disabled, files the structured report by tapping the real pills, then asserts it becomes enabled and mints the introduction record |
| A conducted visit cannot be reopened | `a conducted visit offers no way to reopen or re-file` |
| Evidence is queryable | `the introduction record is queryable as evidence` |
| A no-show closes with **no** introduction record | `a no-show is recorded and closes the visit without an introduction` |
| Sign-out revokes | `signing out clears the session` |

Persistence was verified directly in the database after the run: the
conducted viewing carries both artefacts, the no-show carries none, and the
listing shows the field report's write-back (`availabilityConfirmedAt` set,
`verificationState` verified).

The suite **skips rather than passes** when its seed variables are absent,
so an unseeded run cannot be mistaken for a green one.

Full state: backend **308/308** across 14 suites, `tsc` clean; console
`tsc` clean, `eslint` clean, `next build` clean, **8/8** e2e.

**Deliberately not built:** admin observability screens (reconciliation,
launch gate, verification queue) — those endpoints are Stage 8 and do not
exist yet; building screens against stubs would be scaffolding ahead of the
core, the exact failure mode the Prompt Pack's guardrails exist to prevent.
Also absent: real byte upload (the storage provider is still the mock), and
admin dispatch/assignment screens (assignment works over the API today).
