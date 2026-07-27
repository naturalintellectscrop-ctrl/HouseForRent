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

---

## Module ownership map

(Mirrors Data_Model.md §1 — one module per table, cross-module reads go
through interfaces once services are built in Stage 1+.)

### Identity & Verification

| Table | SSOT decision(s) | Notes |
|---|---|---|
| `party` | Decision 8 (tiers), general | Product-agnostic actor. Role is contextual via `UserAccount.authRole`, not a fixed column — one human can be both tenant and landlord. |
| `user_account` | — (auth plumbing) | Auth binding for a party. V1: one primary role per account. |
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
| `ledger_entry` 🔒 | Decision 3, 7 (money invariants, SSOT §5) | Immutable, balanced double-entry postings grouped by `postingId`. `amount` is always positive `BigInt`; `direction` carries the sign. Balance/immutability are enforced in the service layer (Stage 2), proven by tests — Postgres has no generic "sum-must-balance-per-group" constraint. |
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
4. **Immutability (🔒) is not a database-level constraint in this migration.**
   PostgreSQL has no native "reject UPDATE/DELETE on this table" primitive
   short of triggers or revoking privileges. Data_Model.md §12 requires this
   be provable by test, so Stage 1+ services enforce it at the
   repository/service layer (never issuing UPDATE/DELETE against these
   tables), and the test suite asserts the behavior. A `REVOKE UPDATE, DELETE`
   + trigger-based hard-enforcement is a reasonable defense-in-depth addition
   post-V1 but is not required by any FR and is not added here (build the
   seam, not the feature — avoiding undirected scope growth).
5. **`ScreeningRun.dealId`, `LedgerAccount.dealId`/`ownerPartyId`,
   `LedgerEntry.dealId` are nullable**, matching Data_Model.md's explicit
   "nullable" notes in §6.1 and §8.1 (screening may precede a deal; some
   ledger accounts are internal/revenue accounts with no owner party).

No SSOT conflict was hit in Stage 0 — the Data Model's schema was
implementable as specified once the above (all schema-notation
clarifications, not business-rule changes) were resolved.

---

## What Stage 0 deliberately does not include

No API routes, no NestJS modules/services/controllers beyond the default
scaffold, no seed data, no business logic (mandate enforcement, ledger
balancing, state-transition validation) — all of that is Stage 1 onward, per
the Implementation Prompt Pack's sequencing.
