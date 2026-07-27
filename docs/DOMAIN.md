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
