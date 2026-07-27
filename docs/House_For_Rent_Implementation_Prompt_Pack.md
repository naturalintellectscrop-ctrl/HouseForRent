# House For Rent — Implementation Prompt Pack (V1)

**For:** a local Claude model driving an IDE agent (Cursor / Cline / similar)
**Target:** the full V1 business model as frozen in the Business Discovery Summary
**Companion document:** `House_For_Rent_Business_Discovery_Summary.md` — the SSOT. This pack does not replace it; it operationalises it.

---

## How to use this pack

This is **not one prompt.** It is:

1. A **Master System Prompt** (Section A) — paste this into your IDE's system/rules slot (`.cursorrules`, Cline custom instructions, etc.). It stays constant for the whole build. It pins the model to the SSOT and the non-negotiable rules so it can't drift across sessions.
2. A **Build Sequence** (Section B) — eight stages, each with its own scoped prompt and acceptance criteria. You feed these **one at a time**, in order, and you do not start a stage until the previous stage's acceptance criteria pass. Each stage assumes the Master System Prompt is active.

The ordering is deliberate and is the whole point: the **financial core is built and verified before the UI surface expands.** Do not reorder to "see screens sooner" — the screens are the cheap part.

Before Stage 1, place both `House_For_Rent_Business_Discovery_Summary.md` and this file in the repo (e.g. `/docs`) so the agent can read them directly.

---

## Section 0 — Stack decision (resolve before Stage 1)

You chose mobile-first but did not fix the framework. Recommendation, with reasoning, so you're not blocked:

**Recommended: Flutter (mobile) + a separate backend service; do NOT build the money logic in the app.**

Reasoning specific to this product:
- **The backend is the product.** Ledger, escrow orchestration, commission engine, verification state, deal state machine — all of this MUST live server-side. The mobile app is a client. Whether the client is Flutter or React Native barely matters to the risky parts; it matters only to UI velocity.
- **Flutter over React Native** for this case: single codebase to stable Android + iOS, strong offline/low-bandwidth behaviour (relevant to your market and to the FOO app used in the field on patchy connections), and fewer native-bridge surprises for a small team. React Native is a defensible alternative if your team's existing skill is JS/TS — in which case pick it and keep everything else in this pack unchanged.
- **Backend:** a typed, transaction-safe stack. Recommendation: **PostgreSQL** (non-negotiable — you need real ACID transactions and constraints for a ledger; do not use a document store for money) with a typed server (NestJS/TypeScript, or Django, or Go — pick for team skill). The prompts below are written stack-agnostic and reference "the backend" and "the database"; substitute your choice.

**Two apps, not one.** The FOO field experience (Decision 9) and the tenant/landlord experience are different users with different needs. Plan for a **tenant/landlord app** and an **internal FOO/admin surface** (the FOO surface can be a second app or a responsive web console for V1 — web is often better for admin/ops). This is called out in the stages.

Lock the framework now. Everything below works with either mobile choice.

---

# SECTION A — MASTER SYSTEM PROMPT

> Paste this verbatim into your IDE agent's persistent rules. It applies to every stage.

```
You are the implementation engineer for "House For Rent", a residential rental
marketplace product of Natural Intellects Ltd (Uganda). You are building the
frozen Version 1.

AUTHORITATIVE CONTEXT
- The file /docs/House_For_Rent_Business_Discovery_Summary.md is the Single
  Source of Truth. Read it before acting. If anything I ask conflicts with it,
  STOP and flag the conflict — do not silently resolve it.
- The 11 decisions and the Section 5 cross-cutting constraints in that document
  are non-negotiable. You may choose HOW to implement them; you may not change
  WHAT they require.

NON-NEGOTIABLE ENGINEERING RULES (violating any of these is a defect, even if
the code runs and demos correctly):

MONEY
1. Escrow inflows are a LIABILITY (client money held), never revenue. Model them
   as such in the ledger. Recognising escrow as revenue on receipt is a critical
   defect.
2. All money movement is recorded in a DOUBLE-ENTRY ledger. Every transaction has
   balanced debits and credits. No money state is represented by a single mutable
   balance field that is updated in place.
3. Commission is EARNED at tenant move-in, not at fund release. The sequence is:
   funds enter escrow (liability) -> tenant confirms move-in -> commission earned
   (receivable recognised) -> settlement releases funds. Never collapse these.
4. House For Rent does NOT hold client funds. Fund custody is delegated to an
   external Bank of Uganda-licensed PSP behind a payments abstraction interface.
   You build the abstraction + the ledger + the release/refund logic; the PSP
   holds money. Never write code that assumes our own bank account holds escrow.
5. The commission RATE is snapshotted onto the deal at listing-agreement signing.
   It is NEVER looked up live at settlement time. Rates are versioned with
   effective dates and an audit trail, and are immutable once a deal is in
   progress. Changing the standard rate must not re-price any in-flight deal.
6. Commission is calculated from the agreed MONTHLY rental value, which is a
   distinct field from the total upfront amount transferred into escrow. Never
   compute commission from the escrow inflow.

VERIFICATION & IDENTITY
7. Distinguish IDENTITY verification (who a user is) from AUTHORITY/MANDATE
   verification (a lister's right to market a specific property). They are
   separate concerns with separate data.
8. A broker/agent listing cannot become public without a recorded, verified
   mandate for that specific property. Enforce this at the domain level, not just
   the UI.
9. Lister accounts carry a tier: Property Owner / Verified Broker-Agent /
   Property Management Company. Tiers have different verification requirements.

SCREENING
10. Tenant screening is a MODULAR pipeline. V1 runs identity-only (NIN + phone +
    selfie-vs-ID + basic profile). "Identity-only" must be a CONFIGURATION of the
    pipeline, so future modules (employment, references, rental history, risk
    scoring) plug in without reworking the tenant flow. Do not hardcode identity-
    only as the whole of screening.
11. NIN and personal data handling must assume Uganda Data Protection & Privacy
    Act 2019 obligations: explicit consent capture, purpose limitation, retention
    limits, auditability. Do not store more personal data than V1 requires.

GEOGRAPHY & LISTINGS
12. The operating service area is a CONFIGURABLE boundary, not hardcoded. Adding a
    corridor is a data change.
13. Location model is neighbourhood-taxonomy-first with map pins + landmark
    descriptors. Do NOT make a formal street address a required field.
14. Listing availability is a first-class, EXPIRING attribute with a
    last-confirmed timestamp. Stale listings are detectable and filterable.
15. Listing TIERS and a future SALE transaction type must be representable in the
    model, but V1 ships NO premium operation and NO sale logic. Build the seam,
    not the feature.

FIELD OPS & CIRCUMVENTION
16. Every viewing produces (a) a timestamped INTRODUCTION RECORD and (b) a
    STRUCTURED field report (condition, accuracy-vs-listing, availability, issues,
    timing) — never free-text-only. These records are evidence and analytics from
    day one.
17. The Move-In Guarantee is a STATE in the deal state machine tied to escrow
    release, not a separate financial product. It requires no reserve fund in V1.

REUSABILITY
18. Identity/verification and payments are company-level services with clean
    interfaces (House For Rent is their first consumer), not House-For-Rent-only
    implementations tangled into feature code.

ARCHITECTURE & PROCESS RULES
- The mobile app is a CLIENT. All money, verification-state, deal-state, and
  commission logic lives SERVER-SIDE. The app never computes commission, never
  holds authoritative deal state, never talks to the PSP directly.
- PostgreSQL (or equivalent ACID relational DB) for anything touching money or
  state transitions. Ledger and deal transitions run inside DB transactions.
- Prefer explicit state machines for the deal lifecycle over scattered boolean
  flags. One deal has one authoritative status.
- Write tests for every money path and every state transition BEFORE moving on.
  A money path without a test is not done.
- Type safety end to end. No untyped money. Represent money as integer minor
  units (UGX has no minor unit in practice — use integer shillings), never
  floats. Never use floating point for money.
- Prioritise long-term maintainability over shipping speed (company principle).
  Challenge my instructions if they create poor architecture; propose the better
  design and explain the tradeoff. Do not blindly implement.
- Work in the current stage only. Do not scaffold future stages ahead of time.
- At the end of each stage, report: what you built, which acceptance criteria
  pass, what you deliberately deferred, and any SSOT conflict you hit.
```

---

# SECTION B — BUILD SEQUENCE

Feed one stage prompt at a time. Each ends with acceptance criteria; do not advance until they pass. Stages 1–4 are the risky financial/domain core and are deliberately UI-light. Stages 5–8 build the user surfaces on top of a verified core.

---

## STAGE 0 — Foundation & domain model (no features yet)

**Prompt to give the agent:**
```
Read /docs/House_For_Rent_Business_Discovery_Summary.md fully.

Do NOT build features yet. In this stage:
1. Set up the repository structure for: (a) the backend service, (b) the
   tenant/landlord mobile app, (c) the internal FOO/admin surface. Use the stack
   we fixed in Section 0.
2. Set up PostgreSQL with migrations.
3. Design and write the CORE DOMAIN SCHEMA as migrations, covering these entities
   and NOTHING beyond them yet:
   - User (with role, identity-verification state)
   - Lister profile with TIER (Owner / Broker-Agent / Management Co) and identity-
     verification state — SEPARATE from property mandate
   - Property (neighbourhood taxonomy + geo pin + landmark; NO required street
     address; listing TIER field present but only default tier used; transaction
     type field present, values constrained to RENTAL in V1)
   - PropertyMandate (per-property authority record: who, evidence, verified
     state, verified-by, timestamp) — REQUIRED before a broker listing publishes
   - Listing (monthly rental value as integer shillings; availability status +
     last-confirmed timestamp; publication state)
   - Deal (state machine — define states explicitly; see Stage 3)
   - CommissionRate (versioned, effective-dated, audit trail)
   - LedgerAccount and LedgerEntry (double-entry; see Stage 2)
   - ServiceArea (configurable boundary)
4. Write a short /docs/DOMAIN.md explaining each entity and how it maps to the
   SSOT decisions.

Do not build APIs or screens. Output the schema, the migrations, and DOMAIN.md.
Flag any modelling decision where the SSOT is ambiguous.
```

**Acceptance criteria.** Migrations run clean. Every SSOT entity above exists. Money fields are integer shillings. `Property` has no required street-address field. `PropertyMandate` is separate from lister identity. `CommissionRate` is versioned. Ledger tables exist (even if unused yet). No feature code, no screens.

---

## STAGE 1 — Identity & verification service

**Prompt:**
```
Build the company-level IDENTITY & VERIFICATION service behind a clean interface,
as the first consumer being House For Rent.

Implement:
- User identity verification: NIN capture, phone verification, selfie-vs-ID match.
  Treat the actual NIN-matching / liveness provider as an ABSTRACTED interface
  with a mock implementation for now (real provider is a later integration).
- Explicit CONSENT capture at collection, with purpose and timestamp (DPA 2019).
  Store the minimum data V1 needs; define retention metadata.
- Lister TIER assignment and the per-tier verification requirements.
- AUTHORITY/MANDATE verification for a property, SEPARATE from identity: record
  evidence, verifier, verified state, timestamp.
- Enforce at the domain level: a Broker-Agent or Management Co listing CANNOT
  reach published state without a verified mandate for that property.

Write tests proving: identity verification and mandate verification are
independent; a broker listing without a verified mandate cannot publish; consent
is recorded with purpose and timestamp.
```

**Acceptance criteria.** Identity and mandate are provably separate. Unmandated broker listing cannot publish (test proves it). Consent recorded. External identity provider is behind a mockable interface. Screening is not built here — that's Stage 6.

---

## STAGE 2 — The ledger (money spine, no user money yet)

**Prompt:**
```
Build the DOUBLE-ENTRY LEDGER as the authoritative record of all value movement.
No user-facing money yet — this stage is the accounting engine and its tests.

Requirements:
- LedgerAccount types at minimum: escrow-liability (client money held), commission-
  receivable, commission-revenue, and PSP-settlement/clearing accounts. Model
  client money as a LIABILITY.
- Every money event posts BALANCED entries within a DB transaction. Reject any
  unbalanced posting.
- Provide operations for: record escrow inflow (increases client-money liability,
  NOT revenue); recognise commission earned (moves value to receivable/revenue at
  the move-in event); settle (release funds to landlord, clear liability); refund.
- Money is integer shillings. No floats anywhere in money math.
- Full audit trail: every entry immutable once posted; corrections are new
  reversing entries, never edits.

Write tests proving: escrow inflow does NOT create revenue; commission revenue is
only recognised at the earn event; the ledger always balances; a refund correctly
unwinds a held escrow amount; no operation mutates a posted entry.
```

**Acceptance criteria.** Ledger always balances (property-tested). Escrow inflow creates liability, not revenue (test proves it). Commission recognised only at earn event. Posted entries immutable. All money is integer. This is the stage most likely to be faked — read the tests yourself, don't just trust "tests pass."

---

## STAGE 3 — Deal state machine + commission engine

**Prompt:**
```
Build the DEAL lifecycle as an explicit state machine, and the COMMISSION ENGINE.

Deal states (define transitions explicitly; one deal has one authoritative
status): e.g. created -> tenant_matched -> escrow_funded -> move_in_confirmed
-> commission_earned -> settled -> closed; plus dispute/refund/cancelled paths.
Adjust names as needed but keep the sequence and the guarantee state.

Commission engine rules (from SSOT Section 5 — enforce all):
- On listing-agreement signing, SNAPSHOT the current effective CommissionRate onto
  the deal. Store the snapshot on the deal.
- Commission = snapshotted rate applied to the deal's MONTHLY RENTAL VALUE — never
  the escrow inflow total, never a live rate lookup.
- Commission is EARNED at the move_in_confirmed transition, which triggers the
  ledger's commission-recognition operation (Stage 2).
- Settlement releases landlord funds via the payments abstraction, deducting the
  earned commission, and posts the corresponding ledger entries.
- The Move-In Guarantee is a STATE/condition in this machine tied to escrow
  release (funds protected until move_in_confirmed), NOT a separate product.
- Changing the standard rate must NOT alter any deal already past signing. Prove
  this.

Write tests proving: rate is frozen at signing and immune to later rate changes;
commission uses monthly rent not escrow total; commission recognises exactly at
move-in; guaranteed funds are released only on move-in confirmation; illegal
state transitions are rejected.
```

**Acceptance criteria.** Rate snapshot immune to later changes (test proves it). Commission computed from monthly rent, not escrow total. Earn event fires exactly at move-in and posts to the ledger correctly. Illegal transitions rejected. Guarantee is a state, not a bolt-on.

---

## STAGE 4 — Payments abstraction + escrow orchestration

**Prompt:**
```
Build the PAYMENTS ABSTRACTION LAYER (company-level, House For Rent as first
consumer) and wire escrow orchestration to the ledger and deal machine.

- Define a provider-agnostic interface for: collect funds into escrow, release to
  a payee, refund. Implement a MOCK PSP provider now; the real Bank of Uganda-
  licensed PSP is a later integration behind the same interface.
- House For Rent NEVER holds funds: the interface represents instructions to the
  custodian, and our ledger mirrors custody state — it is not the custodian.
- Support mobile-money-first flows (MTN MoMo / Airtel Money conceptually) via the
  abstraction; do not hardcode one provider.
- Orchestrate the full path against Stages 2-3: fund escrow -> hold -> move-in ->
  earn -> settle (net of commission) -> close; plus refund/timeout/dispute holds.
- Idempotency and reconciliation: every external call is idempotent; provide a
  reconciliation check between ledger state and (mock) PSP state.

Write tests for the full happy path and for: refund before move-in returns tenant
funds fully; a failed/duplicated PSP call does not double-post; ledger reconciles
to PSP state.
```

**Acceptance criteria.** Provider is swappable behind the interface. No code assumes we hold funds. Full escrow lifecycle posts correctly to the ledger. Idempotent external calls. Reconciliation exists. The financial core is now complete and verified — only now do we build surfaces.

---

## STAGE 5 — Listings, search, availability (tenant/landlord app begins)

**Prompt:**
```
Now build user-facing LISTINGS and SEARCH on top of the verified core.

- Lister flow: create property + listing (neighbourhood taxonomy + map pin +
  landmark, NO required street address; monthly rental value; media placeholders
  for Stage 7). Enforce: broker listings need a verified mandate (Stage 1) before
  publish.
- Availability: first-class expiring status with last-confirmed timestamp; surface
  "confirmed available X days ago"; make stale listings filterable/demotable.
- Tenant search/filter tuned to mid-market: neighbourhood, bedrooms, budget band,
  amenities. Results scoped to the configurable ServiceArea.
- Enforce V1 scope: rental transaction type only; single default listing tier
  (tier field present, premium operation NOT built).

Tests: out-of-service-area listings are excluded; unmandated broker listing is
unpublishable; stale availability is detectable.
```

**Acceptance criteria.** Search respects service-area boundary. Availability freshness visible and filterable. Broker mandate enforced at publish. No street address required. Rental-only.

---

## STAGE 6 — Tenant screening pipeline (modular) + onboarding

**Prompt:**
```
Build tenant onboarding and the MODULAR screening pipeline.

- Pipeline architecture: screening is a sequence of pluggable modules with a
  configuration that selects which run. V1 config = identity-only (reuse Stage 1:
  NIN + phone + selfie-vs-ID + basic profile). The pipeline MUST accept future
  modules (employment, references, rental history, risk scoring) without changing
  the tenant flow — demonstrate this with a stub module that is present but
  disabled by config.
- Ability-to-pay is proven by escrow funding (Stage 4), not by documents — do NOT
  collect payslips/bank statements in V1.
- DPA 2019: consent, purpose limitation, retention metadata, auditability.

Tests: identity-only config runs only identity; enabling the stub module changes
behaviour with NO change to the tenant flow code; no financial documents are
collected or stored.
```

**Acceptance criteria.** Screening is config-driven; adding a module needs no tenant-flow rewrite (proven by the stub). Identity-only in V1. No financial-document collection. Consent + retention recorded.

---

## STAGE 7 — Field Operations Officer app + viewing/introduction/report flow

**Prompt:**
```
Build the FOO surface and the field workflow (internal app or responsive web
console).

- FOO can: verify a property, capture professional photos/video (upload pipeline,
  compression for low bandwidth), run listing quality checks, CONFIRM AVAILABILITY
  (updates the Stage 5 freshness timestamp), conduct scheduled viewings, update
  listings, and report on-site issues.
- Viewing flow MUST produce: (a) a timestamped INTRODUCTION RECORD linking tenant
  <-> property <-> FOO <-> time; (b) a STRUCTURED field report (condition,
  accuracy-vs-listing, availability, issues, timing) — structured fields, not free
  text only.
- Scheduling/dispatch: assign viewings within the service corridor; track no-shows.
- These records feed circumvention evidence, availability, and analytics — persist
  them as first-class data.

Tests: a viewing cannot be closed without an introduction record and a structured
report; availability confirmation updates freshness; introduction record is
queryable as evidence.
```

**Acceptance criteria.** No viewing closes without a structured report + introduction record. Availability confirmation flows to listing freshness. Media pipeline handles low bandwidth. Introduction records are queryable.

---

## STAGE 8 — Full flow integration, circumvention clause surfacing, hardening

**Prompt:**
```
Integrate the end-to-end journey and harden.

- Wire the complete tenant journey: search -> request viewing -> FOO viewing +
  introduction record -> match -> escrow funding -> move-in confirmation ->
  guarantee release -> settlement (commission deducted) -> close.
- Landlord agreement: surface the commission terms (with snapshotted rate) and the
  CIRCUMVENTION CLAUSE at listing-agreement signing; store acceptance.
- Public positioning consistency: tenant-facing copy says free-for-tenants; the
  landlord is the contractual payer in agreements.
- Security & compliance pass: authz on every money/state endpoint; audit logs on
  money and verification events; PII access controls; consent + retention honoured.
- Observability: admin view of live verified inventory vs the launch gate;
  ledger/PSP reconciliation dashboard; deal-state monitoring.

Tests: full journey end-to-end; commission at settlement equals the snapshot times
monthly rent; a tenant introduced via FOO is linked for circumvention evidence;
authz denies cross-role access to money/state endpoints.
```

**Acceptance criteria.** Full journey passes end-to-end. Settlement commission matches snapshot × monthly rent. Circumvention evidence linkage works. Authz enforced on sensitive endpoints. Launch-gate inventory is observable. Reconciliation dashboard exists.

---

# SECTION C — Guardrails for working with the agent

- **Read the money tests yourself.** Stages 2–4 are where a model produces convincing-but-wrong code. "Tests pass" is not enough — read what the tests actually assert against the Section 5 rules.
- **Stop-on-conflict is a feature.** If the agent flags an SSOT conflict, that's the system working. Resolve it against the SSOT (amend the SSOT formally if genuinely needed), don't wave it through.
- **Don't let it scaffold ahead.** If you ask for Stage 3 and it starts building screens, pull it back. Surface-before-core is the failure mode this whole sequence exists to prevent.
- **The real integrations are deliberately deferred** behind interfaces: the licensed PSP, the NIN/liveness provider, the mobile-money rails. Do not let the agent hardcode a specific provider — the mock-behind-interface pattern is what lets legal/procurement catch up in parallel (SSOT Section 8).
- **One stage, one review, one commit boundary.** Keep stages as separate review units so drift is catchable.

---

# SECTION D — What this pack deliberately does NOT do

- It does not finalise the commission figure, the launch-gate number, or the corridor — those close via the unit-economics model and landlord interviews (SSOT Section 7), not in code.
- It does not integrate the real PSP, real NIN provider, or real mobile-money rails — those are procurement + legal gated (SSOT Section 8) and sit behind the interfaces built here.
- It does not build any premium-tier operation, any sale flow, or any property-management/recurring-billing feature — all post-V1 (SSOT Section 6). The seams exist; the features do not.
```
