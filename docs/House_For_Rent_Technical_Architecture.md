# House For Rent — Technical Architecture

**Product:** House For Rent (V1)
**Owner:** Natural Intellects Ltd
**Document:** 2 of 4 (PRD → **Technical Architecture** → Data Model → API Specification)
**Authority:** Subordinate to the SSOT and consistent with the approved PRD. Defines *how* the PRD's requirements are realised structurally. Does not introduce business decisions; where it must make an engineering choice with business impact, it is flagged as an **[Architectural Decision]** with reasoning.

---

## 1. Architectural goals & the forces shaping them

Three forces from the SSOT dominate every choice below:

1. **Money correctness over everything.** The system holds (via a custodian) and moves other people's money. Correctness, auditability, and transactional integrity outrank performance, convenience, and delivery speed. This pushes toward a relational core, explicit state machines, and a double-entry ledger as the single source of financial truth.
2. **Reusability at company level.** Identity/verification and payments are Natural Intellects services, not House For Rent features (SSOT Decision 7, 18). This pushes toward clean service boundaries with interfaces that a second product (Smart Ride) could consume.
3. **Configurability without architectural churn.** Validation (commission rate, corridor, gate, freshness window) must move parameters, not structure (PRD §1.5). This pushes configuration into a versioned, served-at-runtime store rather than into code or per-deal logic.

The counter-force is **team scale and delivery**: Natural Intellects is a small team building several products. That argues *against* premature microservice sprawl. The architecture below resolves this tension explicitly (Section 3).

---

## 2. System context

Three client surfaces, one backend, external providers behind abstractions.

```
        ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────────┐
        │  Tenant app     │   │ Landlord/Lister │   │ FOO + Admin surface  │
        │  (mobile)       │   │ app (mobile)    │   │ (web console, V1)    │
        └────────┬────────┘   └────────┬────────┘   └──────────┬───────────┘
                 │                     │                        │
                 └──────────── HTTPS / REST (+ auth) ───────────┘
                                       │
                          ┌────────────▼─────────────┐
                          │   House For Rent Backend  │
                          │  (modular monolith, V1)   │
                          │                           │
                          │  Product modules:         │
                          │   listings, search,       │
                          │   viewings/fieldops,      │
                          │   deals+guarantee,        │
                          │   agreements, admin/ops   │
                          │                           │
                          │  Shared (company) svcs:   │
                          │   Identity/Verification,  │
                          │   Payments (ledger+PSP    │
                          │   abstraction),           │
                          │   Notifications,          │
                          │   Media, Audit, Config    │
                          └───┬───────────┬───────┬───┘
                              │           │       │
                   ┌──────────▼──┐  ┌─────▼────┐  ▼ (other providers behind
                   │ PostgreSQL  │  │ Object    │  interfaces: NIN/liveness,
                   │ (ACID core) │  │ storage   │  SMS/push, map/geo)
                   └─────────────┘  │ (media)   │
                                    └───────────┘
                                          │
                              ┌───────────▼────────────┐
                              │  External licensed PSP  │  ← holds client funds
                              │  (Bank of Uganda-lic.)  │     (custodian)
                              └─────────────────────────┘
```

**Key fact restated as architecture:** the PSP is the fund custodian. House For Rent's backend holds only the *ledger* (its mirror of custody state) and the *orchestration logic*. No House For Rent component ever holds client money.

---

## 3. [Architectural Decision] Modular monolith, not microservices, for V1

**Decision.** V1 backend is a **single deployable modular monolith** with strict internal module boundaries, not a set of independently deployed microservices. The company-level services (Identity, Payments) are **modules with clean, product-agnostic interfaces** inside that monolith — designed so they can later be extracted into standalone services without rewriting their consumers.

**Reasoning.**
- The strongest argument *for* microservices here is the reusability mandate — Smart Ride needs Identity and Payments too. But reusability comes from **interface discipline**, not from network boundaries. A well-bounded module with a stable interface is extractable later; a badly-bounded microservice is a distributed mess you can't fix. Get the boundary right first, distribute later if load demands it.
- The money core requires **cross-module transactions** (a deal transition posts ledger entries and updates deal state atomically). In a monolith this is one DB transaction. Across microservices it's a distributed-transaction / saga problem — enormous accidental complexity to impose on a small team at V1, and a rich source of money bugs.
- Team scale: a small team shipping several products cannot afford the operational overhead (deploy pipelines, service mesh, inter-service observability) of microservices per product.

**Consequence / constraint.** Module boundaries MUST be enforced in code (no reaching into another module's tables directly; interaction only through the module's interface). Identity and Payments especially MUST NOT leak product concepts (no "listing" or "landlord" inside Payments — it deals in parties, accounts, and instructions). This is what preserves later extraction and cross-product reuse.

**Revisit trigger.** Extract a module to its own service only when a concrete force demands it (independent scaling, a second product consuming it in production, or team structure). Not before.

---

## 4. Module decomposition

### 4.1 Shared (company-level) modules

**Identity & Verification.**
- Owns: users, credentials/sessions, identity-verification state (NIN, phone, selfie-match), consent records, lister tiers, and **authority/mandate** verification.
- Interface deals in *parties* and *verifications*, not listings. "Is party X identity-verified?" and "Does party X hold a verified mandate for property Y?" are interface questions; the *enforcement* that an unmandated broker listing can't publish lives in the Listings module calling this interface (keeps Identity product-agnostic).
- External NIN/liveness provider behind a `IdentityProvider` interface with a mock impl for V1 build/test.
- [Architectural Decision] Identity vs. mandate are **two separate verification types** in one module, never conflated — mandate is a (party, property, evidence, state) record; identity is a (party, method, state) record.

**Payments.** (The heart; see Section 5.)
- Owns: the double-entry ledger, the PSP abstraction, escrow orchestration primitives, refund/settlement/reconciliation.
- Product-agnostic: knows parties, accounts, amounts, instructions — not "rent" or "commission". The *meaning* of a posting (which is commission, which is escrow) is supplied by the caller via account types and references, not hardcoded product logic.

**Notifications.** (New — flagged in PRD handoff.)
- Owns: SMS and push delivery behind a `NotificationChannel` interface (provider-agnostic). Triggers: viewing confirmations, escrow status changes, move-in prompts, verification outcomes.
- [Architectural Decision] Notifications is a shared module from day one, not a scattered set of inline SMS calls, because it's cross-cutting and reused across products, and because delivery is unreliable in-market and needs central retry/observability.

**Media.**
- Owns: upload pipeline, low-bandwidth compression, object-storage references, perceptual-hash hooks (seam for future duplicate-listing detection). Product modules store media *references*, not blobs.

**Audit.**
- Owns: append-only audit log for money events, verification events, consent, and configuration changes (NFR-2). Interface: `record(event)`; immutable.

**Config.**
- Owns: versioned, effective-dated configuration served at runtime — commission standard rate, service-area boundary, freshness window, screening module set, required-months defaults.
- [Architectural Decision] Config values that touch money (the commission rate) are **served with their version**, and consumers that snapshot them (the deal at signing) store the *versioned value*, not a live reference. This is the mechanism that makes "changing the rate can't re-price in-flight deals" (FR-7.4) structurally true rather than a discipline.

### 4.2 Product modules

**Listings & Properties.** Property/listing lifecycle, taxonomy-first location, availability freshness, tier/transaction-type seams, corridor scoping. Calls Identity for mandate enforcement at publish; calls Config for service-area and freshness window.

**Search & Discovery.** Corridor-scoped query, mid-market filters, trust-signal projection, honest empty states. Read-optimised over the listings data.

**Viewings & Field Ops.** Scheduling/dispatch, FOO viewing conduct, **introduction records**, **structured field reports**. Writes availability freshness back to Listings; produces circumvention evidence for Deals. "Conducted by" is a role-typed reference (FOO in V1; partner seam).

**Screening.** The modular pipeline; V1 config = identity-only (delegates to Identity). Pipeline module set comes from Config; a disabled stub module proves extensibility.

**Deals & Guarantee.** The deal state machine, the commission engine, the Move-In Guarantee state, circumvention linkage. Orchestrates Payments (ledger + escrow) on transitions. This is the module that composes shared services into the core business flow (Section 6).

**Agreements.** Listing-agreement presentation and acceptance; originates the **rate snapshot** onto the deal (pulls the versioned rate from Config, hands it to Deals to freeze).

**Admin & Ops.** Config management UI-backing, verification queue, launch-gate monitoring, ledger/PSP reconciliation views, dispute handling.

---

## 5. The money core (Payments module) — detailed

This is the part most likely to be built wrong, so it is specified structurally here and in full in document 3.

### 5.1 Double-entry ledger
- Two tables conceptually: `ledger_account` (typed: escrow-liability, commission-receivable, commission-revenue, psp-clearing, landlord-payable, etc.) and `ledger_entry` (immutable, balanced postings).
- **Invariant enforced in code and DB:** every posting is a set of entries summing to zero. Unbalanced postings are rejected before commit.
- **Immutability:** posted entries are never updated or deleted. Corrections are new reversing postings. (FR-7.2)
- Money is integer shillings everywhere; no float type appears in any money column or computation. (NFR-4)

### 5.2 PSP abstraction
- `PaymentProvider` interface: `collectToEscrow(instruction)`, `releaseTo(payee, instruction)`, `refund(instruction)`, `status(ref)`.
- V1 ships a **MockPaymentProvider**; the licensed PSP is a later implementation of the same interface (procurement workstream). No consumer knows which is behind it.
- **[Architectural Decision] The ledger is authoritative; the PSP is custodial.** The backend never treats a PSP balance as truth for business logic — it acts on ledger state and *reconciles* against PSP state. Divergence raises a reconciliation alert (FR-7.8), it does not silently trust either side.
- Idempotency: every provider call carries an idempotency key; duplicate callbacks are de-duplicated at the boundary so no event double-posts. (FR-7.8)

### 5.3 Escrow orchestration primitives
Exposed to Deals as intention-revealing operations, each atomic (ledger posting + state within one DB transaction):
- `fundEscrow(dealRef, amount)` → increases escrow-liability; **creates no revenue**.
- `recogniseCommission(dealRef, amount)` → at move-in; moves value to receivable/revenue.
- `settle(dealRef)` → releases landlord-payable via PSP net of recognised commission; clears liability.
- `refund(dealRef, amount)` → returns tenant funds; unwinds liability.
- Dispute hold / timeout auto-release as guarded transitions.

The **sequencing rule** (fund → move-in → recognise → settle) is enforced by the Deals state machine (Section 6), not left to callers.

---

## 6. The deal lifecycle — how modules compose

The deal is the spine that composes shared services. One authoritative status; explicit transitions; illegal transitions rejected (FR-8.1). Illustrative flow (exact states finalised in document 3):

```
 created
   │  (tenant matched after FOO viewing + introduction record)
 tenant_matched
   │  (Agreements: rate SNAPSHOTTED from Config onto deal; lister accepted terms+circumvention clause)
 agreement_signed ───────────────► [rate is now frozen on this deal, versioned, immutable]
   │  (Payments.fundEscrow → escrow-liability up, NO revenue)
 escrow_funded ─────────────────► [Move-In Guarantee ACTIVE: funds protected]
   │  (tenant confirms move-in; FOO may verify)
 move_in_confirmed
   │  (Payments.recogniseCommission → commission EARNED here, not at release)
 commission_earned
   │  (Payments.settle → landlord paid net of commission via PSP)
 settled
   │
 closed

 side paths: cancelled / refunded (pre-move-in → full tenant refund) / dispute_hold
```

**The four invariants this flow makes structural** (each an FR, each testable):
1. Commission rate is frozen at `agreement_signed` and immune to later Config changes (FR-7.4).
2. Commission base is monthly rent, never the escrow total (FR-7.3) — the engine reads the deal's monthly-rent field.
3. Commission is earned at `move_in_confirmed`, not at `settled` (FR-7.5).
4. Funds are releasable only at/after `move_in_confirmed`; before that, only refund is possible — that *is* the Move-In Guarantee (FR-8.2).

**[Architectural Decision] The guarantee is not a product, it's the absence of a release path before move-in.** Modelling it as a state constraint (no `settle` transition reachable pre-move-in) rather than as a separate financial instrument is what lets it require no reserve fund in V1 — you're only ever returning money you already hold.

---

## 7. Client architecture (three surfaces)

**[Architectural Decision] The apps are thin clients; all money, state, verification, and commission logic is server-side.** The mobile app never computes commission, never holds authoritative deal state, never contacts the PSP. It renders server state and issues intent. This is a security and correctness boundary, not just a layering preference — money logic on a client is money logic an attacker can rewrite.

- **Tenant app (mobile):** search, detail, viewing request, escrow payment, move-in confirmation. Framework TBD (Flutter recommended; RN acceptable) — see Section 9.
- **Landlord/Lister app (mobile, or a mode):** onboarding+tier, mandate proof (brokers), listing creation, agreement acceptance, dashboard/settlement view.
- **FOO + Admin (web console, V1):** [Architectural Decision] web, not mobile, for V1 — it's an internal ops tool where clarity, form density, and speed beat native polish, and a responsive web console is faster to build and iterate. The FOO field-capture parts must work on a phone browser with low bandwidth; a dedicated FOO mobile app is a post-V1 option if field use demands it.

All three speak REST over HTTPS with role-scoped auth (document 4 defines contracts).

---

## 8. Cross-cutting concerns

**AuthN/AuthZ.** Central auth (Identity module). Role-based authorisation enforced server-side on every endpoint; money/state-transition endpoints deny cross-role access (NFR-1). Authorisation is checked at the module interface, not only at the HTTP layer.

**Transactionality.** Any operation touching money or a state transition runs inside a single PostgreSQL transaction spanning the ledger posting and the state change. No eventual-consistency between a deal's status and its ledger effect. (This is a primary reason for the monolith, Section 3.)

**Auditability & consent.** Audit module records money, verification, consent, and config-change events, append-only. DPA 2019 obligations (consent, purpose, retention, PII access control) enforced in Identity and Screening (NFR-3).

**Idempotency & reconciliation.** At the PSP boundary (Section 5.2) and on any externally-triggered callback.

**Observability.** Launch-gate inventory, deal-state distribution, and ledger↔PSP reconciliation are first-class admin views (FR-10.3, 10.4), not afterthoughts.

**Configuration serving.** Config module serves versioned values; money-touching values are consumed *by snapshot* (Section 4.1), never by live reference in an in-flight deal.

---

## 9. Technology constraints & open choices

**Fixed (standing constraints):**
- **PostgreSQL** (or equivalent ACID relational DB) for the money/state core. No document store for money. Ledger and transitions run in DB transactions.
- Money as **integer shillings**; no floats.
- Server-authoritative money/state; thin clients.
- Shared services behind product-agnostic interfaces; external providers (PSP, NIN, SMS/push, geo) behind mockable interfaces.

**Open (must be locked before Stage 1 of the build):**
- **Mobile framework** — Flutter recommended (single codebase, low-bandwidth resilience, fewer native-bridge surprises for a small team); React Native acceptable if team skill is JS/TS. Locks the client stack but nothing server-side.
- **Backend language/framework** — a typed, transaction-safe stack (NestJS/TypeScript, Django, or Go). Choose for team skill; the architecture is stack-agnostic above this line.
- **Object storage** provider for media.
- **PSP partner** — external dependency in the parallel procurement workstream; the interface is built regardless, so this does not block coding.

---

## 10. How validation results map to this architecture (the parallel-workstream contract)

Restating the governing rule against the actual structure, so the boundary is unambiguous:

| Validation finding | What changes | What does NOT change |
|---|---|---|
| Different commission figure | Config value (versioned) | Ledger, commission engine, snapshot mechanism |
| Landlords reject fee entirely | **Escalation** — challenges SSOT Decision 3; formal amendment, not a config tweak | — (this is the "fundamentally disproven" case) |
| Different corridor / gate number | Config values (service area, gate) | Corridor-scoping mechanism, listings model |
| Tenants won't fund multi-month | Escrow UX + required-months config | Ledger, deal machine, escrow primitives |
| PSP terms differ | The PSP provider implementation behind the interface | Everything above the `PaymentProvider` interface |

The invariant: **safeguards are structural, parameters are configurable.** Verification, escrow-as-liability, mandate enforcement, the commission-snapshot mechanism, and DPA compliance are architecture and change only by logged SSOT amendment. Rates, boundaries, windows, and thresholds are configuration.

---

## 11. Handoff to document 3 (Data Model)

The Data Model must specify, concretely:
- The ledger schema (`ledger_account` types, `ledger_entry` with the balanced-posting constraint expressed as schema + check logic).
- The deal entity and its **explicit state enum + allowed-transition definition**, finalising the illustrative states in Section 6.
- The commission-rate versioning schema (effective-dated, audited) and the **per-deal rate snapshot** field(s).
- Identity vs. mandate as two separate schemas; lister tier.
- Listing: monthly-rent (integer), tier + transaction-type seam fields, availability status + last-confirmed timestamp, taxonomy location (no required street address).
- Introduction record and structured field report schemas.
- Consent + retention metadata shape (DPA 2019).
- Config schema (versioned, effective-dated).
- The seam fields (listing tier, transaction type, "conducted by", screening module set) expressed so future values need no migration of existing rows.
