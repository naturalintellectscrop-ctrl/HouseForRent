# House For Rent — Data Model / Schema Specification

**Product:** House For Rent (V1)
**Owner:** Natural Intellects Ltd
**Document:** 3 of 4 (PRD → Technical Architecture → **Data Model** → API Specification)
**Authority:** Subordinate to the SSOT; consistent with the approved PRD and Technical Architecture. This is the document Stage 0 of the build implements directly.

**Conventions.**
- Notation is PostgreSQL-flavoured but stack-agnostic in intent. Types: `uuid`, `text`, `bigint` (money, integer shillings), `timestamptz`, `boolean`, `jsonb`, enumerated types shown as `enum(...)`.
- **All money is `bigint` integer shillings. No `numeric`/`float`/`decimal` for money. No exceptions.**
- Every table has `id uuid pk default gen_random_uuid()`, `created_at timestamptz not null default now()`, and (where mutable) `updated_at timestamptz`. These are omitted from listings below for brevity except where semantically relevant.
- **Seam fields** (marked ⟡) exist in V1 but have their values constrained to the V1 subset by application logic and/or a check constraint that can be relaxed later *without migrating existing rows*. This is how "build the seam, not the feature" is made concrete.
- **Immutable** tables (marked 🔒) reject `UPDATE`/`DELETE` on written rows; corrections are new rows.
- Foreign keys are `not null` unless the relationship is genuinely optional.

---

## 1. Module ownership map

Each table belongs to exactly one module (Technical Architecture §4). Cross-module reads go through interfaces, not direct table access — the FKs below that cross modules are logical references honoured via interface, and are called out.

| Module | Tables |
|---|---|
| Identity & Verification | `party`, `user_account`, `session`, `lister_profile`, `identity_verification`, `consent_record`, `property_mandate` |
| Payments | `ledger_account`, `ledger_entry`, `psp_instruction`, `reconciliation_check` |
| Config | `config_parameter`, `config_version`, `commission_rate_version` |
| Listings & Properties | `property`, `listing`, `neighbourhood`, `amenity`, `listing_amenity` |
| Viewings & Field Ops | `viewing`, `introduction_record`, `field_report` |
| Screening | `screening_run`, `screening_module_result` |
| Deals & Guarantee | `deal`, `deal_transition` |
| Agreements | `listing_agreement` |
| Media | `media_asset` |
| Audit | `audit_event` |

---

## 2. Identity & Verification

### 2.1 `party`
The product-agnostic actor (Technical Architecture §4.1 — Identity deals in *parties*). A party may be a tenant, a lister, an FOO, or admin — role is contextual, not a fixed column, because one human could be both a tenant and a landlord.
```
party
  id            uuid pk
  display_name  text not null
  primary_phone text not null unique
  status        enum('active','suspended','closed') not null default 'active'
```

### 2.2 `user_account`
Auth binding for a party (FOO/admin/tenant/landlord all authenticate). Kept separate from `party` so a party can exist (e.g. a landlord created by ops) before self-service credentials.
```
user_account
  id            uuid pk
  party_id      uuid fk -> party.id
  auth_role     enum('tenant','lister','foo','admin') not null
  -- credentials handled by auth subsystem; no password columns modelled here
```
Note: `auth_role` is the *login context*. A single human with two roles has two `user_account` rows against one `party`, or a multi-role token — resolved in document 4. V1 keeps it simple: one primary role per account.

### 2.3 `session`
Standard session/refresh record (fields per auth choice). Not detailed here.

### 2.4 `lister_profile`
```
lister_profile
  id                    uuid pk
  party_id              uuid fk -> party.id unique
  tier                  enum('property_owner','broker_agent','property_mgmt_company') not null
  -- tier drives verification + mandate requirements (FR-1.1, FR-3.2)
```

### 2.5 `identity_verification`
Identity = who a party is. **Separate** from mandate (Technical Architecture §4.1). One row per verification attempt; current state derivable from latest.
```
identity_verification
  id            uuid pk
  party_id      uuid fk -> party.id
  method        enum('nin','phone','selfie_match') not null
  state         enum('pending','verified','failed') not null default 'pending'
  provider_ref  text            -- opaque ref from external IdentityProvider (mock in V1)
  verified_at   timestamptz
  -- a party is "identity-verified" when it has a 'verified' row for each required method
```
[Design note] We store *state per method*, not a single boolean, so the three-factor requirement (NIN + phone + selfie) is explicit and auditable, and so a future 4th method plugs in without schema change.

**No NIN value is stored in plaintext in this table.** The raw NIN is handled by the IdentityProvider boundary; what persists here is verification *state* and an opaque `provider_ref`. (DPA 2019 data minimisation, NFR-3.)

### 2.6 `consent_record` 🔒
```
consent_record
  id            uuid pk
  party_id      uuid fk -> party.id
  purpose       text not null            -- e.g. 'identity_verification'
  granted_at    timestamptz not null
  retention_until timestamptz            -- retention metadata (DPA 2019)
  policy_version text not null
```
Immutable: consent is a historical fact. Withdrawal is a new row of a `consent_withdrawal` purpose, never an edit.

### 2.7 `property_mandate`
Authority = a lister's right to market a *specific* property (FR-3.2, FR-3.3). A (lister, property) pair. **This is what an unmandated broker listing lacks.**
```
property_mandate
  id            uuid pk
  lister_party_id uuid fk -> party.id
  property_id   uuid fk -> property.id      -- logical cross-module ref (Listings)
  evidence_media_id uuid fk -> media_asset.id   -- proof document/photo
  state         enum('pending','verified','rejected') not null default 'pending'
  verified_by_party_id uuid fk -> party.id    -- the FOO/admin who verified
  verified_at   timestamptz
  unique(lister_party_id, property_id)
```
[Enforcement, stated for document 4] A `broker_agent` or `property_mgmt_company` listing cannot transition to `live` unless a `verified` mandate exists for (its lister, its property). `property_owner` listings do not require a mandate row in V1 (PRD FR-3.2), subject to field verification.

---

## 3. Config (versioned, effective-dated)

### 3.1 `config_parameter` + `config_version` 🔒(versions)
Generic versioned config for non-money parameters: service-area boundary, freshness window (days), screening module set, required-months default.
```
config_parameter
  id            uuid pk
  key           text not null unique   -- 'service_area','freshness_window_days','screening_modules','launch_gate_count'
  value_type    enum('int','json','text') not null

config_version 🔒
  id            uuid pk
  parameter_id  uuid fk -> config_parameter.id
  value         jsonb not null
  effective_from timestamptz not null
  created_by_party_id uuid fk -> party.id
  -- current value = latest version whose effective_from <= now()
```
Versions are immutable; a change is a new version. (FR-10.1)

### 3.2 `commission_rate_version` 🔒
Commission rate is money-touching, so it gets its own explicit versioned table (Technical Architecture §4.1 — money config is served *with its version* and consumed by snapshot).
```
commission_rate_version 🔒
  id              uuid pk
  -- rate expressed as a multiple of monthly rent, stored as basis points of a month
  -- to avoid floats: 10000 bp = 1.0 month; 5000 bp = 0.5 month
  rate_bp_of_month integer not null       -- e.g. 10000 = one month's rent
  effective_from  timestamptz not null
  created_by_party_id uuid fk -> party.id
  note            text
```
[Design note — this is the mechanism behind FR-7.4] The rate is **basis points of one month's rent** (integer), so `commission = monthly_rent * rate_bp_of_month / 10000`, computed in integer arithmetic. No float ever touches commission. The *default* V1 value is a config choice pending landlord validation (≈10000 bp), and changing it creates a **new version** — it never mutates an existing version, and in-flight deals hold a **snapshot** (§7), so they are structurally immune to the change.

---

## 4. Listings & Properties

### 4.1 `neighbourhood`
Taxonomy-first location (FR-2.2). Hierarchical to allow corridor grouping.
```
neighbourhood
  id            uuid pk
  name          text not null            -- 'Ntinda','Kiwatule',...
  parent_id     uuid fk -> neighbourhood.id  -- nullable; for grouping (e.g. a corridor)
  in_service_area boolean not null default false  -- corridor scoping via Config-driven flag
```
[Design note] Corridor membership is a data flag, not code (FR-2.5). Adding Kira to the corridor = set `in_service_area = true`. The authoritative service-area definition lives in Config (`service_area`); this flag is its materialised projection for query performance, refreshed when the config changes.

### 4.2 `property`
```
property
  id                uuid pk
  owner_party_id    uuid fk -> party.id       -- the lister who created it
  property_type     enum('apartment','house','room','other') not null
  bedrooms          integer not null
  bathrooms         integer not null
  furnished         enum('furnished','semi_furnished','unfurnished') not null
  neighbourhood_id  uuid fk -> neighbourhood.id
  geo_lat           double precision          -- map pin (approximate area)
  geo_lng           double precision          -- NOTE: geo is not money; double precision is fine here
  landmark_text     text not null             -- 'off Kira Road, past X'
  street_address    text                      -- OPTIONAL. never required (FR-2.2)
  transaction_type  enum('rental') not null default 'rental'  ⟡  -- seam: 'sale' addable later
```
⟡ `transaction_type` is a single-value enum in V1. Adding `'sale'` is an enum extension (Postgres `ALTER TYPE ... ADD VALUE`), which does **not** migrate or invalidate existing rows. Seam preserved. (FR-2.4)

### 4.3 `listing`
```
listing
  id                    uuid pk
  property_id           uuid fk -> property.id
  monthly_rent          bigint not null        -- integer shillings (FR-2.1). THE commission base.
  required_months_upfront integer not null      -- landlord-set; default from Config
  deposit_amount        bigint not null         -- integer shillings
  tier                  enum('standard') not null default 'standard'  ⟡  -- seam: 'premium' addable later
  publication_state     enum('draft','awaiting_verification','live','rented','withdrawn') not null default 'draft'
  verification_state    enum('unverified','verified') not null default 'unverified'
  availability_status   enum('available','unavailable') not null default 'available'
  availability_confirmed_at timestamptz          -- freshness (FR-2.3)
  description_text       text
```
⟡ `tier` is single-value in V1 (seam for premium operations). Availability freshness: a listing is **stale** when `now() - availability_confirmed_at > freshness_window` (window from Config). Stale listings are demoted/filtered (FR-2.3); staleness is computed, not stored, so the window can change by config.

[Invariant, for document 4] `publication_state = 'live'` requires `verification_state = 'verified'` AND, for broker/mgmt-company listers, a `verified` `property_mandate`. Enforced at the transition, server-side.

### 4.4 `amenity`, `listing_amenity`
Standard many-to-many. Amenities drive a search filter (FR-4.1).
```
amenity           id, name
listing_amenity   listing_id fk, amenity_id fk, unique(listing_id, amenity_id)
```

---

## 5. Viewings & Field Ops

### 5.1 `viewing`
```
viewing
  id                uuid pk
  listing_id        uuid fk -> listing.id
  tenant_party_id   uuid fk -> party.id
  conducted_by_party_id uuid fk -> party.id   ⟡  -- V1: must be an FOO. seam: certified partner later
  conducted_by_role enum('foo') not null default 'foo'  ⟡
  scheduled_for     timestamptz not null
  status            enum('requested','scheduled','conducted','no_show','cancelled') not null default 'requested'
```
⟡ `conducted_by_role` is FOO-only in V1 (FR-5.6 seam). Adding `'certified_partner'` is an enum extension; existing rows unaffected.

[Invariant, for document 4] A `viewing` cannot move to `conducted` without (a) an `introduction_record` and (b) a `field_report` (FR-5.3, FR-5.4).

### 5.2 `introduction_record` 🔒
Circumvention evidence (FR-5.3, FR-8.3). Immutable — it is evidence.
```
introduction_record 🔒
  id                uuid pk
  viewing_id        uuid fk -> viewing.id unique
  tenant_party_id   uuid fk -> party.id
  listing_id        uuid fk -> listing.id
  landlord_party_id uuid fk -> party.id
  foo_party_id      uuid fk -> party.id
  introduced_at     timestamptz not null
```
[Design note] This is the timestamped tenant↔property↔landlord↔FOO linkage that makes the circumvention clause enforceable. It persists independently of the deal — a bypassed deal (no deal record) still leaves this evidence.

### 5.3 `field_report`
Structured, not free-text-only (FR-5.4). Feeds the "what our officer confirmed" panel (FR-4.3) and availability freshness.
```
field_report
  id                uuid pk
  viewing_id        uuid fk -> viewing.id unique
  foo_party_id      uuid fk -> party.id
  condition_rating  enum('excellent','good','fair','poor') not null
  matches_listing   boolean not null           -- accuracy-vs-listing
  is_available      boolean not null            -- writes back to listing.availability_*
  issues_text       text                        -- structured note field, optional
  timing_note       text
  media_asset_ids   uuid[]                       -- captured photos/video (refs)
  reported_at       timestamptz not null
```
[Design note] `matches_listing` and `condition_rating` are structured fields precisely so they become baseline data for future Certified Partner standards (SSOT Decision 9) — you can't certify against a standard you never measured.

---

## 6. Screening (modular pipeline)

### 6.1 `screening_run` + `screening_module_result`
The pipeline is data-driven: which modules run comes from Config (`screening_modules`); V1 = `['identity']`. (FR-6.1, FR-6.2)
```
screening_run
  id                uuid pk
  tenant_party_id   uuid fk -> party.id
  deal_id           uuid fk -> deal.id           -- nullable; screening may precede a deal
  overall_state     enum('pending','passed','failed') not null default 'pending'
  module_set        jsonb not null               -- snapshot of which modules ran, e.g. ['identity']

screening_module_result
  id                uuid pk
  screening_run_id  uuid fk -> screening_run.id
  module_key        text not null                -- 'identity' (V1); 'employment','references',... (future)
  state             enum('pending','passed','failed','skipped') not null
  detail            jsonb
```
[Design note — this is FR-6.2 made concrete] Adding a future module = a new `module_key` value and a new pipeline module; **no schema change** to these tables, and no change to the tenant flow. The `module_set` snapshot on each run records what actually ran, so history is interpretable after the config changes. A present-but-disabled stub module can be enabled purely by editing the `screening_modules` config value.

Ability-to-pay is **not** a screening module — it is evidenced by escrow funding (FR-6.3). No employment/financial documents are modelled anywhere in V1.

---

## 7. Deals & Guarantee (the spine)

### 7.1 `deal`
```
deal
  id                    uuid pk
  listing_id            uuid fk -> listing.id
  tenant_party_id       uuid fk -> party.id
  landlord_party_id     uuid fk -> party.id
  introduction_record_id uuid fk -> introduction_record.id  -- circumvention linkage
  status                enum(
                          'created','tenant_matched','agreement_signed',
                          'escrow_funded','move_in_confirmed','commission_earned',
                          'settled','closed','cancelled','refunded','dispute_hold'
                        ) not null default 'created'
  -- SNAPSHOTTED at agreement_signed, immutable thereafter (FR-7.4):
  monthly_rent_snapshot bigint             -- copied from listing at signing (commission base)
  commission_rate_bp_snapshot integer      -- copied from commission_rate_version at signing
  commission_rate_version_id uuid fk -> commission_rate_version.id  -- provenance
  -- derived, stored at earn time:
  commission_amount     bigint             -- = monthly_rent_snapshot * commission_rate_bp_snapshot / 10000
  agreement_id          uuid fk -> listing_agreement.id
```
[This is the heart of FR-7.3, FR-7.4, FR-7.5]
- `monthly_rent_snapshot` and `commission_rate_bp_snapshot` are **copied onto the deal at `agreement_signed`** and never updated. A later change to the listing's rent or to `commission_rate_version` cannot alter an in-flight deal. Immunity is structural, not disciplinary.
- `commission_amount` is computed in integer arithmetic from the *snapshots*, at the `commission_earned` transition — never from the escrow total (FR-7.3), never from a live rate.

### 7.2 `deal_transition` 🔒
Explicit, auditable state history. One authoritative status on `deal`; full history here.
```
deal_transition 🔒
  id                uuid pk
  deal_id           uuid fk -> deal.id
  from_status       text not null
  to_status         text not null
  actor_party_id    uuid fk -> party.id
  reason            text
  occurred_at       timestamptz not null
```

### 7.3 Allowed transitions (the state machine)
Enforced in code; illegal transitions rejected (FR-8.1). This table **is** the machine — document 4 exposes only transitions that appear here.

| From | To | Trigger / guard |
|---|---|---|
| created | tenant_matched | FOO viewing conducted + introduction_record exists |
| tenant_matched | agreement_signed | lister accepts listing_agreement; **rate + rent snapshotted here** |
| agreement_signed | escrow_funded | Payments.fundEscrow succeeds (liability up, **no revenue**) |
| escrow_funded | move_in_confirmed | tenant confirms move-in |
| move_in_confirmed | commission_earned | Payments.recogniseCommission (**earned here**, FR-7.5) |
| commission_earned | settled | Payments.settle (landlord paid net via PSP) |
| settled | closed | terminal |
| tenant_matched / agreement_signed / escrow_funded | cancelled | pre-funding cancel; if funded → must route via refunded |
| escrow_funded | refunded | pre-move-in refund → **full tenant refund** (FR-7.7) |
| any active | dispute_hold | ops action; blocks settle (FR-10.5) |
| dispute_hold | (prior or refunded/settled) | ops resolution |

**Move-In Guarantee (FR-8.2), stated as a structural fact:** there is **no transition from `escrow_funded` to `settled`**. The only exits from `escrow_funded` are `move_in_confirmed` (forward) or `refunded` (money back). Therefore funds are unreleasable until move-in — the guarantee is the *shape of the graph*, needing no reserve fund.

---

## 8. Payments (ledger & PSP)

### 8.1 `ledger_account`
Typed accounts (Technical Architecture §5.1). Product-agnostic: no "rent"/"commission" as columns — meaning comes from `account_type`.
```
ledger_account
  id            uuid pk
  account_type  enum('escrow_liability','commission_receivable','commission_revenue',
                     'landlord_payable','psp_clearing') not null
  owner_party_id uuid fk -> party.id            -- nullable for internal/revenue accounts
  deal_id       uuid fk -> deal.id              -- nullable; ties per-deal accounts to a deal
  currency      text not null default 'UGX'
```

### 8.2 `ledger_entry` 🔒
Immutable, balanced postings. The single source of financial truth.
```
ledger_entry 🔒
  id            uuid pk
  posting_id    uuid not null                   -- groups the balanced set
  account_id    uuid fk -> ledger_account.id
  direction     enum('debit','credit') not null
  amount        bigint not null                 -- integer shillings, > 0
  deal_id       uuid fk -> deal.id
  reference     text                            -- e.g. 'fund_escrow','recognise_commission','settle','refund'
  occurred_at   timestamptz not null
```
**Invariants (enforced in code within the DB transaction, FR-7.2):**
- For a given `posting_id`, `sum(debits) = sum(credits)`. Unbalanced → rejected before commit.
- No `UPDATE`/`DELETE` on any row. Corrections = a new reversing `posting_id`.
- `amount > 0` always; direction carries the sign.
- Money is `bigint`; no float anywhere.

[Canonical postings — the four operations, for document 4 and Stage 2]
- **fund_escrow:** debit `psp_clearing`, credit `escrow_liability` (client money in; **no revenue account touched**).
- **recognise_commission** (at move_in_confirmed): debit `escrow_liability`, credit `commission_revenue` for `commission_amount` (earned).
- **settle:** debit `escrow_liability` (remaining), credit `landlord_payable`; then PSP release debits `landlord_payable`, credits `psp_clearing`.
- **refund** (pre-move-in): debit `escrow_liability`, credit `psp_clearing` (full held amount back to tenant).

### 8.3 `psp_instruction` 🔒
The idempotent boundary to the external custodian (Technical Architecture §5.2).
```
psp_instruction 🔒
  id                uuid pk
  deal_id           uuid fk -> deal.id
  kind              enum('collect','release','refund') not null
  amount            bigint not null
  idempotency_key   text not null unique         -- dedupes duplicate callbacks (FR-7.8)
  provider_ref      text
  state             enum('pending','succeeded','failed') not null default 'pending'
```

### 8.4 `reconciliation_check`
Ledger-vs-PSP reconciliation (FR-7.8, FR-10.4).
```
reconciliation_check
  id            uuid pk
  run_at        timestamptz not null
  ledger_balance bigint not null
  psp_balance   bigint not null
  is_reconciled boolean not null
  discrepancy_note text
```

---

## 9. Agreements

### 9.1 `listing_agreement` 🔒
Originates the rate snapshot (FR-9.1). Immutable once accepted.
```
listing_agreement 🔒
  id                uuid pk
  listing_id        uuid fk -> listing.id
  lister_party_id   uuid fk -> party.id
  commission_rate_version_id uuid fk -> commission_rate_version.id  -- the rate presented & frozen
  monthly_rent_at_signing bigint not null       -- the rent frozen into the deal
  circumvention_clause_version text not null
  accepted_at       timestamptz not null
  accepted          boolean not null default false
```
[Design note] At acceptance, the deal copies `commission_rate_version.rate_bp_of_month` → `deal.commission_rate_bp_snapshot` and `monthly_rent_at_signing` → `deal.monthly_rent_snapshot`. The agreement names the **landlord as payer** (FR-9.2); tenant-facing surfaces carry no charge.

---

## 10. Media & Audit

### 10.1 `media_asset`
```
media_asset
  id            uuid pk
  storage_ref   text not null              -- object-storage key; not a blob in the DB
  kind          enum('image','video') not null
  perceptual_hash text                     -- seam: future duplicate-listing detection
  uploaded_by_party_id uuid fk -> party.id
```

### 10.2 `audit_event` 🔒
Append-only (NFR-2). Money, verification, consent, config-change events.
```
audit_event 🔒
  id            uuid pk
  event_type    text not null              -- 'ledger.posting','identity.verified','config.changed',...
  actor_party_id uuid fk -> party.id
  subject_ref   text                        -- e.g. deal_id, party_id
  payload       jsonb
  occurred_at   timestamptz not null
```

---

## 11. Seam inventory (explicit, for review)

Every deferred-feature seam in one place, so review can confirm none is a hidden feature and none blocks a future one:

| Seam field/table | V1 constraint | Future value(s) | Migration needed later? |
|---|---|---|---|
| `property.transaction_type` ⟡ | `'rental'` only | `'sale'` | No — enum add value |
| `listing.tier` ⟡ | `'standard'` only | `'premium'` | No — enum add value |
| `viewing.conducted_by_role` ⟡ | `'foo'` only | `'certified_partner'` | No — enum add value |
| `screening` module set | `['identity']` | `+employment,references,risk_scoring` | No — new `module_key` rows |
| `media_asset.perceptual_hash` | present, unused | duplicate detection | No — column exists |
| `neighbourhood` hierarchy | one corridor flagged | more corridors | No — data flag |

No seam requires migrating existing rows to activate. That is the test the SSOT's "build the seam, not the feature" imposes, and every seam above passes it.

---

## 12. Integrity rules summary (for Stage 0 → Stage 4 tests)

The rules a reviewer or test suite checks against, consolidated:

1. Money columns are all `bigint`; grep the schema for `numeric`/`float`/`decimal` on money → must be none.
2. `ledger_entry` postings balance per `posting_id`; unbalanced rejected.
3. `ledger_entry`, `consent_record`, `introduction_record`, `deal_transition`, `commission_rate_version`, `config_version`, `listing_agreement`, `psp_instruction`, `audit_event` are immutable (no update/delete of written rows).
4. `deal.monthly_rent_snapshot` and `commission_rate_bp_snapshot` are set once at `agreement_signed` and never updated → a later rate-version change leaves them intact.
5. `commission_amount = monthly_rent_snapshot * commission_rate_bp_snapshot / 10000`, integer arithmetic, computed at `commission_earned`.
6. No transition exists from `escrow_funded` directly to `settled` (the guarantee).
7. `listing.publication_state='live'` ⇒ `verification_state='verified'` and (broker/mgmt) a `verified` mandate.
8. `viewing.status='conducted'` ⇒ an `introduction_record` and a `field_report` exist.
9. No table stores plaintext NIN or any employment/financial document in V1.
10. Every seam in §11 activates without row migration.

---

## 13. Handoff to document 4 (API Specification)

The API spec must expose:
- Endpoints per surface (tenant, lister, FOO/admin), role-scoped.
- The deal transitions of §7.3 as guarded state-changing endpoints — and **only** those transitions.
- Money operations as intent endpoints that internally run the canonical postings of §8.2 inside one transaction; never raw ledger writes from clients.
- Config/rate management endpoints (admin), version-creating, never mutating.
- Idempotency-key handling on all PSP-facing and externally-callback endpoints.
- Authorisation matrix: which role may trigger which transition/endpoint (money and state endpoints deny cross-role access, NFR-1).
- Read endpoints projecting trust signals (verified, freshness, "what our officer confirmed") from the underlying structured data.
