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

### ⚠️ FLAGGED SSOT AMBIGUITY — Data_Model.md §7.3 (needs your ruling)

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

**Implemented: the strict reading** — the `escrow_funded → cancelled` edge is
ABSENT — because it is the only reading that is safe if wrong, and it is the
one both the row's own guard and the closing paragraph support. Recorded in
code as the exported `ESCROW_FUNDED_CANCEL_AMBIGUITY` constant and asserted
by test. **If you intend row 8's "From" column literally, this needs an
explicit amendment**, since it would change a Move-In Guarantee property.

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
ambiguity raised at Checkpoint 3 **remains open and unruled** — the strict
reading is still in force.
