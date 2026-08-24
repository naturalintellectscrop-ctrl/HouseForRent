# House For Rent — Product Requirements Document (PRD)

**Product:** House For Rent (V1)
**Owner:** Natural Intellects Ltd
**Document:** 1 of 4 in the implementation set (PRD → Technical Architecture → Data Model → API Specification)
**Authority:** Subordinate to `House_For_Rent_Business_Discovery_Summary.md` (the SSOT). Where this PRD and the SSOT conflict, the SSOT wins and this document is corrected. This PRD *operationalises* the SSOT's 11 decisions into buildable requirements; it does not introduce new business decisions.

---

## 1. Purpose & scope

### 1.1 What this document is
The PRD defines *what the product must do* — features, user stories, functional requirements, and acceptance criteria — for the frozen V1. It is the document the AI coder reads alongside the SSOT. It stops short of *how* (services, schema, endpoints); those are documents 2–4.

### 1.2 What V1 is
A trust-first residential rental marketplace for mid-market Kampala, in which House For Rent verifies properties through its own field officers, holds the tenant's upfront payment in licensed escrow until move-in, and earns a one-time success commission from the landlord on a completed let.

### 1.3 In scope (V1)
Long-term residential rentals only; the Ntinda–Kira launch corridor; the public web marketplace and the tenant, landlord/lister and Field Operations Officer / admin surfaces within it; identity-only tenant screening; landlord-paid success commission via escrow; the Move-In Guarantee (property-integrity scope).

> **Revised 2026-08-24.** This document originally scoped tenant and
> landlord surfaces as MOBILE apps. They are now surfaces of one responsive
> web application; see Technical Architecture §7 for the decision and its
> reasoning. No functional requirement below changed as a result — the
> requirements were about what a tenant and a landlord must be able to do,
> not about what they must install.

### 1.4 Out of scope (V1) — build the seam, not the feature
Property sales; premium-tier *operations*; property management / recurring billing; diaspora-tenant remote transacting and cross-border payments; enhanced screening modules; Certified Partner viewing program; tenant-conduct guarantees. Each must be *representable* in the model without being *built* (per SSOT Decisions 1, 6, 9, 10, 11).

### 1.5 Configurable vs. fixed (the parallel-validation contract)
Per the direction governing this build: validation results adjust **configuration or business parameters**, never architecture, unless an assumption is *fundamentally* disproven. The following are **configuration**, not hardcoded logic, and every requirement below treats them as such:

| Parameter | V1 provisional value | Validated by |
|---|---|---|
| Commission rate | ≈ 1 month's rent (configurable multiple of monthly rent) | Landlord interviews |
| Launch inventory gate | ~40–60 live verified listings | Unit-economics model |
| Service-area corridor | Ntinda → Kiwatule → Kisaasi → Kyanja → Najjera → Kira | Landlord acquisition |
| Availability freshness window | 7 days | Ops experience |
| Required upfront months | Per-listing (landlord-set) | Market reality |
| Leakage assumption | TBD | Unit-economics model |

---

## 2. Personas

**Tenant (primary demand).** A mid-market Kampala professional, browsing from an Android phone, mobile-money-native, often on a slower connection. Has been burned by fake listings, wasted transport, and deposit risk. Wants: genuine, available, verified homes; no viewing fees; assurance their money is safe until they actually move in.

**Property Owner (primary supply).** Owns 1–3 units, frequently absentee (including diaspora). Wants tenants filled fast, low hassle, and trustworthy occupants. Historically pays agents nothing (brokers extract from tenants), so must be sold the *substitution*: a verified tenant with escrow-secured funds, at no upfront cost and no risk.

**Broker / Agent (conditional supply).** Controls access to units but is the market's main source of fake/stale listings. Accepted only under stricter terms and per-property mandate proof.

**Property Management Company (supply).** Manages portfolios; a distinct verification tier.

**Field Operations Officer (internal).** The physical embodiment of the trust promise. Verifies properties, captures media, confirms availability, conducts viewings, produces structured field reports and introduction records.

**Admin / Ops (internal).** Manages verification queue, service area, commission-rate configuration, disputes, and monitors the launch-gate inventory and ledger reconciliation.

---

## 3. Epics (traceable to SSOT decisions)

| Epic | Delivers | SSOT decisions |
|---|---|---|
| E1 Identity & accounts | User/lister accounts, identity verification, tiers | 8, 10 |
| E2 Property & listings | Listing creation, taxonomy location, availability freshness, tiers/type seams | 1, 2, 6, 8 |
| E3 Verification & mandate | Property verification state; per-property mandate for brokers | 8, 9 |
| E4 Search & discovery | Corridor-scoped search, mid-market filters, trust signals | 1, 2 |
| E5 Viewings & field ops | Scheduling, FOO viewings, introduction records, structured reports | 9, 11 |
| E6 Screening | Modular pipeline, identity-only V1 config | 10 |
| E7 Money: escrow, ledger, commission | Escrow via PSP, double-entry ledger, commission engine, settlement | 3, 4, 5, 7 |
| E8 Deal lifecycle & guarantee | Deal state machine, Move-In Guarantee, circumvention evidence | 3, 9, 11 |
| E9 Agreements | Listing agreement, commission terms, circumvention clause acceptance | 3, 4, 11 |
| E10 Admin & ops | Config, verification queue, gate monitoring, reconciliation, disputes | 2, 4, 7 |

---

## 4. Functional requirements & user stories

Requirement IDs are `FR-<epic>.<n>`. Each carries acceptance criteria (AC). "MUST" is mandatory for V1; "MUST (seam)" means the capability's *extension point* is required though the feature is deferred.

### E1 — Identity & accounts

**FR-1.1 — Account creation by role.** The system MUST support account creation for Tenant and Lister, and Lister MUST carry one of three tiers: Property Owner, Broker/Agent, Property Management Company.
- AC: a user selects role at signup; lister selects tier; tier is stored and drives later verification requirements.

**FR-1.2 — Identity verification (all users transacting).** The system MUST verify identity via NIN capture, phone verification, and selfie-vs-ID match, with explicit consent captured at collection (purpose + timestamp).
- AC: identity cannot reach "verified" without all three; consent record exists with purpose and timestamp; the external matching provider is behind an abstraction (mockable).

**FR-1.3 — Identity is separate from authority.** Identity verification state MUST be independent of any property mandate (see FR-3.x).
- AC: a lister can be identity-verified while having zero verified mandates, and vice-versa is impossible for publishing (see FR-3.2).

**FR-1.4 — Data minimisation & consent (DPA 2019).** The system MUST store only the personal data V1 requires, record consent and purpose, and hold retention metadata.
- AC: no employment/financial documents are collected in V1; each PII record has consent + purpose + retention metadata.

### E2 — Property & listings

**FR-2.1 — Create property & listing.** A lister MUST be able to create a property and a listing carrying: property type, bedrooms, bathrooms, furnished state, monthly rental value (integer shillings), upfront terms (months required, deposit).
- AC: monthly rental value stored as integer shillings; no float anywhere.

**FR-2.2 — Taxonomy-first location.** Location MUST be neighbourhood-taxonomy-first with a map pin and a landmark description. A formal street address MUST NOT be a required field.
- AC: a listing publishes with neighbourhood + pin + landmark and no street address; search uses the taxonomy.

**FR-2.3 — Availability freshness.** Every listing MUST carry an availability status and a last-confirmed timestamp. Listings not confirmed within the configurable freshness window (default 7 days) MUST be flagged stale and demoted/filterable.
- AC: freshness window is configuration; stale listings are detectable, filterable, and visibly marked.

**FR-2.4 — Listing tier & transaction-type seams.** A listing MUST carry a tier field (only the default operational tier active in V1) and a transaction-type field constrained to RENTAL in V1.
- AC (seam): both fields exist; premium-tier operations and SALE values are rejected by V1 validation but the schema permits future values without migration of existing rows.

**FR-2.5 — Corridor scoping.** Listings and search MUST respect a configurable service-area boundary.
- AC: a listing outside the active service area cannot be published to the public feed; adding a corridor is a configuration/data change, not a code change.

### E3 — Verification & mandate

**FR-3.1 — Property verification state.** A listing MUST NOT become publicly live until it has passed field verification (see E5) — reflected as a verification state on the listing.
- AC: only verified listings appear in the public feed; verification state transitions are auditable.

**FR-3.2 — Per-property mandate for brokers.** A Broker/Agent or Property Management Company listing MUST NOT publish without a recorded, verified mandate proving authority to market that specific property. This MUST be enforced at the domain level.
- AC: an unmandated broker listing is unpublishable (enforced server-side, proven by test); Property Owner listings do not require a separate mandate (their identity + ownership assertion suffices for V1, subject to field verification).

**FR-3.3 — Mandate is per-property, not per-lister.** Mandate MUST attach to a (lister, property) pair with evidence, verifier, verified state, and timestamp.
- AC: a broker with a mandate on property A cannot publish property B without a separate mandate.

### E4 — Search & discovery

**FR-4.1 — Corridor-scoped search.** Tenants MUST be able to search verified, in-corridor listings with filters: neighbourhood (taxonomy), budget band (UGX), bedrooms, amenities.
- AC: results are limited to verified + in-service-area + non-stale-prioritised listings.

**FR-4.2 — Trust signals as first-class UI.** Each result and the detail view MUST surface: a Verified badge, an availability freshness line ("confirmed X days ago"), and a "free for tenants" reassurance.
- AC: these appear on card and detail; they are data-driven, not static copy.

**FR-4.3 — Field-confirmed summary.** The property detail MUST present a structured summary of what the FOO confirmed (condition, matches listing, available).
- AC: the summary is populated from the structured field report (FR-5.4), not free text.

**FR-4.4 — Honest empty states.** Low/zero-result searches MUST present an honest, non-dead-end message.
- AC: empty state communicates ongoing verification rather than failure.

### E5 — Viewings & field operations

**FR-5.1 — Request a viewing.** A verified tenant MUST be able to request a viewing and select from available time slots; the flow MUST communicate that a House For Rent FOO (not the landlord/broker) will meet them.
- AC: a viewing request creates a scheduled viewing tied to tenant + property + time.

**FR-5.2 — Scheduling & dispatch.** The system MUST allow assignment of viewings to FOOs within the service corridor and track status including no-shows.
- AC: viewings are assignable; status lifecycle is tracked.

**FR-5.3 — Introduction record.** Every conducted viewing MUST produce a timestamped introduction record linking tenant ↔ property ↔ FOO ↔ time.
- AC: the record is created on viewing conduct and is queryable as circumvention evidence.

**FR-5.4 — Structured field report.** A viewing MUST NOT be closable without a structured field report capturing condition, accuracy-vs-listing, availability, issues, and timing — structured fields, not free-text-only.
- AC: closing a viewing without the structured report is rejected; the report updates availability freshness (FR-2.3) and feeds FR-4.3.

**FR-5.5 — Verification via field visit.** The FOO field visit MUST be able to set/refresh property verification state and capture professional media (upload pipeline with low-bandwidth compression).
- AC: verification state and media originate from a field visit; media degrades gracefully.

**FR-5.6 — Partner-viewing seam.** The viewing model MUST (seam) allow a future non-FOO certified party to conduct viewings under policy, without redesign.
- AC (seam): "conducted by" is a role-typed reference, not hardcoded to FOO; V1 permits only FOO.

### E6 — Screening

**FR-6.1 — Modular screening pipeline.** Tenant screening MUST be a pipeline of pluggable modules selected by configuration. V1 configuration = identity-only.
- AC: the active module set is configuration; identity-only runs only identity.

**FR-6.2 — Extension without flow change.** Adding a future module (employment, references, rental history, risk scoring) MUST NOT require changing the tenant flow.
- AC (seam): a present-but-disabled stub module can be enabled by config and changes behaviour with no tenant-flow code change (proven by test).

**FR-6.3 — Ability-to-pay via escrow, not documents.** V1 MUST NOT collect payslips, bank statements, or references in the standard flow; ability-to-pay is evidenced by escrow funding.
- AC: no financial documents collected/stored in V1.

### E7 — Money: escrow, ledger, commission

**FR-7.1 — Escrow via licensed custodian.** The system MUST route custody of funds through an external Bank of Uganda–licensed PSP behind a payments abstraction. House For Rent MUST NOT hold client funds.
- AC: no code path assumes House For Rent holds funds; the PSP is swappable behind the interface; a mock provider exists for build/test.

**FR-7.2 — Double-entry ledger.** All value movement MUST be recorded as balanced double-entry postings within DB transactions. Client money MUST be modelled as a liability, not revenue.
- AC: unbalanced postings are rejected; escrow inflow increases a client-money liability and creates no revenue (proven by test); posted entries are immutable (corrections are reversing entries).

**FR-7.3 — Commission base.** Commission MUST be computed from the agreed monthly rental value, never from the total upfront amount transferred into escrow.
- AC: with a 6-month upfront payment, commission still equals the configured multiple × monthly rent (proven by test).

**FR-7.4 — Rate snapshot & immutability.** The applicable commission rate MUST be snapshotted onto the deal at listing-agreement signing, versioned with effective dates and audit trail, and immutable once the deal is in progress. Changing the standard rate MUST NOT re-price in-flight deals.
- AC: after signing, a standard-rate change leaves the deal's rate unchanged (proven by test); rate history is auditable.

**FR-7.5 — Earn timing.** Commission MUST be recognised as earned at the tenant move-in event, not at fund release.
- AC: the earn ledger event fires exactly at move-in confirmation; settlement/release is a distinct subsequent event.

**FR-7.6 — Settlement.** On settlement, the system MUST release funds to the landlord via the PSP net of earned commission and post corresponding ledger entries.
- AC: landlord receives (upfront held − earned commission); ledger reflects the release and the revenue; reconciliation holds.

**FR-7.7 — Refund & timeout.** The system MUST support full refund of tenant funds before move-in, plus dispute holds and timeout auto-release rules.
- AC: pre-move-in refund returns tenant funds fully and unwinds the liability; refund/timeout paths post correctly and are idempotent.

**FR-7.8 — Idempotency & reconciliation.** All external money calls MUST be idempotent; the system MUST provide reconciliation between ledger state and PSP state.
- AC: duplicate PSP callbacks do not double-post; a reconciliation check exists and passes.

### E8 — Deal lifecycle & guarantee

**FR-8.1 — Explicit deal state machine.** A deal MUST have one authoritative status progressing through explicit states (e.g. created → tenant_matched → escrow_funded → move_in_confirmed → commission_earned → settled → closed) with dispute/refund/cancelled paths. Illegal transitions MUST be rejected.
- AC: transitions are validated; one deal has exactly one status; illegal transitions rejected (proven by test).

**FR-8.2 — Move-In Guarantee.** The Move-In Guarantee MUST be a state/condition within the deal machine tied to escrow release: tenant funds remain protected until move-in confirmation. Scope is property-integrity only (exists, matches listing, available, funds protected). No reserve fund; no tenant-conduct guarantee in V1.
- AC: funds are releasable only at/after move-in confirmation; guarantee is not a separate financial product.

**FR-8.3 — Circumvention evidence linkage.** A tenant introduced via a FOO viewing MUST be linked (via the introduction record) to the property/landlord for circumvention evidence.
- AC: given a FOO introduction, the tenant↔property↔landlord linkage is queryable.

### E9 — Agreements

**FR-9.1 — Listing agreement at signing.** Before a listing goes live, the lister MUST accept a listing agreement presenting, in plain language: the commission terms (with the snapshotted rate, charged only on a successful let) and the circumvention clause. Acceptance MUST be recorded.
- AC: agreement acceptance is stored with the rate snapshot reference and timestamp; the rate snapshot (FR-7.4) originates here.

**FR-9.2 — Positioning consistency.** Tenant-facing surfaces MUST state "free for tenants"; the landlord MUST be the contractual payer in the agreement.
- AC: no tenant-facing charge exists anywhere; the agreement names the landlord as payer.

### E10 — Admin & ops

**FR-10.1 — Configuration management.** Admin MUST be able to manage configuration: commission standard rate (versioned), service-area boundary, freshness window, screening module set.
- AC: each is editable as configuration with audit; rate edits create new versions and never mutate in-flight deals.

**FR-10.2 — Verification queue.** Ops MUST have a queue of properties awaiting verification and a view of verification/mandate states.
- AC: queue reflects real states; actions transition states auditably.

**FR-10.3 — Launch-gate monitoring.** Admin MUST see live verified inventory against the configurable launch gate.
- AC: the count reflects verified + in-corridor + fresh listings against the gate value.

**FR-10.4 — Ledger & reconciliation dashboard.** Admin MUST have visibility of ledger state, deal states, and ledger↔PSP reconciliation.
- AC: reconciliation status is visible; discrepancies are surfaced.

**FR-10.5 — Disputes.** Ops MUST be able to place a deal into a dispute hold and resolve it via defined paths (release/refund).
- AC: dispute hold blocks settlement; resolution posts correct ledger entries.

---

## 5. Cross-cutting non-functional requirements

**NFR-1 Security & authz.** Every money and state-transition endpoint MUST enforce role-based authorisation. Cross-role access to money/state endpoints MUST be denied. (SSOT Section 1: security-first.)

**NFR-2 Auditability.** Money events, verification events, consent, and configuration changes MUST be audit-logged.

**NFR-3 Data protection (DPA 2019).** Consent, purpose limitation, retention metadata, and PII access controls MUST apply wherever personal data is handled.

**NFR-4 Money integrity.** Money is integer shillings; no floats; all money mutations occur via balanced ledger postings inside DB transactions.

**NFR-5 Low-bandwidth resilience.** Client surfaces MUST perform on slower Android connections; media MUST compress and degrade gracefully.

**NFR-6 Maintainability & type safety.** End-to-end type safety; explicit state machines over scattered flags; company-level services (identity, payments) behind clean interfaces. (SSOT Section 1.)

**NFR-7 Configurability.** All Section 1.5 parameters MUST be configuration, changeable without code deployment where practical, and never able to re-price in-flight deals.

---

## 6. Assumptions under active validation (do not architect against these being fixed)

Per the parallel-workstream direction, these are provisional and may move via configuration:

1. Landlords will accept a landlord-side success commission near one month's rent. *(If fundamentally disproven — landlords will not pay at all — this challenges Decision 3 and is escalated, not silently reconfigured.)*
2. The corridor holds sufficient mid-market verified supply to meet the gate.
3. Tenants will fund multi-month upfront amounts into escrow. *(If disproven, escrow UX and required-months config adjust; the ledger/deal architecture does not.)*
4. A licensed PSP partner is obtainable on workable commercial terms. *(A hard external dependency; tracked in the PSP workstream.)*

The one-way rule: validation may relax or adjust a **parameter**; it may not be used to remove a **safeguard** (verification, escrow-as-liability, mandate enforcement, DPA compliance). A safeguard is changed only by a formal, logged SSOT amendment.

---

## 7. Traceability & open items

Every FR traces to at least one SSOT decision (Section 3 table). Open items inherited from the SSOT and *not* resolved by this PRD, because they are validation outputs, not design choices: exact commission figure, launch-gate number, leakage assumption, corridor boundaries, refund/timeout timing specifics, and who absorbs mobile-money fees. Each is configuration or an ops-policy value, consistent with Section 1.5.

---

## 8. What the next document (Technical Architecture) must resolve

Handoff notes for document 2, so the boundary between "what" and "how" stays clean:
- The service decomposition and the company-level vs product-level split (identity, payments as shared services).
- The payments abstraction's interface and the PSP integration boundary.
- Where the ledger and deal state machine live and how transactionality is guaranteed.
- The three-surface topology (tenant app, landlord app/mode, FOO-admin surface) and their shared backend.
- Tech-stack confirmation — RESOLVED 2026-08-24: Next.js web client, NestJS API, PostgreSQL for money and state (a standing constraint).
- How configuration (Section 1.5) is stored, versioned, and served without enabling in-flight re-pricing.
