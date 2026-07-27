# House For Rent — Business Discovery Summary

**Product:** House For Rent
**Owner:** Natural Intellects Ltd
**Document type:** Single Source of Truth (SSOT) — Business Model, Version 1
**Status:** FROZEN. Supersedes all prior business discussion. All PRDs, technical architecture, database design, operations manuals and implementation documents must conform to this document. Any change to a decision below is a formal amendment, dated and logged, not an implementation choice.

---

## 0. How to read this document

This is the business foundation, not the technical specification. It defines *what the business is and why*, so that every downstream decision — data model, API, UX, operations, pricing, legal — has an authoritative answer to appeal to. Where a decision carries a hard constraint on implementation, it is stated explicitly under **Technical implications** and must be honoured; the AI coder and future engineers are not free to reinvent these.

Three things are deliberately **not** frozen and are flagged as such inline: the exact commission figure, the precise launch-inventory number, and the final corridor boundaries. Each has a defined validation path. Everything else is fixed for V1.

---

## 1. Company context

House For Rent is a **product of Natural Intellects Ltd**, not a standalone company. It sits alongside NISMS (school management SaaS), Smart Ride (mobility super-app), and others in the portfolio. Two consequences bind House For Rent's architecture to the company, not just to itself:

- **Shared infrastructure.** Identity/verification and payments are company-level services, not House For Rent features. The payments abstraction layer specified in Decision 7 is expected to serve Smart Ride and others. Build it as a Natural Intellects service with House For Rent as its first consumer.
- **Shared reputation.** House For Rent's trust positioning reflects on the whole company. Quality and security standards are non-negotiable because the cost of failure is borne portfolio-wide.

---

## 2. The problem

Uganda's residential rental market fails tenants and absentee landlords in specific, addressable ways:

- Fake and stale listings — units advertised that are already let, or never existed, used as bait.
- Unreliable brokers, including brokers marketing properties they have no authority over.
- Wasted transport and time viewing misrepresented or unavailable units.
- Deposit and advance-payment fraud — money paid to someone who isn't the owner.
- No trustworthy signal of whether a listing is genuine, current, or available.

Existing platforms (Jiji, Facebook groups, listing portals) compete on inventory volume and are widely regarded as untrustworthy. **The unsolved problem is trust, not listing supply.** That is the gap House For Rent occupies.

---

## 3. Strategic positioning

House For Rent is a **trust-first residential property platform**, not a listings board. Its defensibility comes from verification performed by feet on the ground, not from catalogue size — a moat competitors cannot copy by scraping more listings.

**Public positioning statement:**
> "House For Rent is a trusted residential property platform starting with verified urban homes for professionals and extending into premium verified properties for executives, diaspora clients, and high-value renters."

**Long-term vision:** evolve from a verified-rental marketplace into the operating system for residential renting and property management in Uganda — landlord CRM, tenant management, digital leases, payments, inspections, maintenance, analytics, and AI-assisted services — introduced only as transaction history and operational maturity accumulate.

---

## 4. The accepted decisions

Eleven decisions were taken during the Business Discovery workshop. Each is recorded below in full.

---

### Decision 1 — Market beachhead

**Decision.** Primary beachhead is **mid-market urban residential rentals** (roughly UGX 500,000–2,500,000/month), Kampala. Premium/executive residential is a **quality standard applied to every listing**, plus an opportunistic and future segment — **not** a separate operational business in V1. Diaspora effort is directed at **landlords**, not tenants. Excluded from the beachhead: budget/muzigo, student accommodation, short-stay, commercial, land.

**Reasoning.** Verification cost is effectively flat across price bands while revenue scales with rent, so margin is a direct function of segment. Mid-market is the lowest band where verified listings pay for themselves, and its tenants are smartphone- and mobile-money-native and already suffer the exact failures the product solves. Mid-market landlords skew absentee, making them the natural entry to property management. Premium is retained as a brand and future-revenue asset without incurring its (relationship-based, high-touch) operational cost prematurely. The diaspora *value* — high-value relationships, remote reach, management pipeline — sits on the landlord side within mid-market, so it is captured without building a premium tier or remote-tenant transacting in V1.

**Business implications.** Pricing benchmarks against the prevailing letting-commission norm. Marketing speaks to working professionals, not bargain hunters. Landlord acquisition targets absentee small-portfolio owners, including diaspora. Budget segment deliberately deferred until verification unit cost falls.

**Technical implications.** Listing tiers and verification levels must exist in the data model at V1 even though only one operational tier is active — premium is a configuration, not a future rewrite. Media pipeline must support professional-grade photography/video from launch. Cross-border/remote-tenant payment is **out** of V1. Search/filter tuned to mid-market behaviour (bedrooms, neighbourhood, budget band, amenities).

**Risks.** Premium ambition creeping into operational commitment and diluting launch focus. Mid-market being the most contested segment — differentiation must be on trust, not volume. Absentee landlords being slower to onboard than local brokers.

**Future considerations.** Budget-segment entry once verification cost per unit falls; student accommodation as a seasonal adjacent product; full premium-tier activation once corridor liquidity is proven.

---

### Decision 2 — Launch geography and liquidity gate

**Decision.** Initial operating corridor: **Ntinda → Kiwatule → Kisaasi → Kyanja → Najjera → Kira** (provisional, to be refined by actual landlord acquisition and market feedback). Launch is gated on **verified inventory, not on a date**. Provisional gate: **~40–60 live verified listings** in the corridor with availability confirmed within the preceding 7 days *(number to be finalised at unit-economics validation)*. Expansion is trigger-based: no second corridor until corridor one sustains the inventory threshold, a defined seeker match rate, and a verification cost per listing below a threshold set at unit-economics time.

**Reasoning.** Verification cost per listing is dominated by travel time — a contiguous corridor roughly triples an officer's daily output versus crossing Kampala, at identical cost, so contiguity is a margin decision. Mid-market tenants search by commute, so a contiguous corridor produces genuinely substitutable results — the mechanism that makes a marketplace feel liquid. A date-based launch with thin inventory produces a single, unrecoverable first impression for a trust brand.

**Business implications.** Landlord acquisition and marketing spend concentrated in a bounded geography. Field team staffed for a defined area. Listings outside the corridor are declined at launch — a deliberate discipline; support staff must decline gracefully.

**Technical implications.** Service area must be a **configurable boundary**, not hardcoded — corridor two is a data change. Location model is **neighbourhood-taxonomy-first with map pins and landmark descriptors**, not address-first (Uganda's street addressing is weak). Availability freshness is a **first-class, expiring attribute** of a listing. Admin tooling reports live verified inventory against the gate.

**Risks.** Corridor may lack sufficient mid-market supply at required quality (mitigated by treating it as provisional). Out-of-corridor landlords turned away may not return. **Primary failure mode: pressure to lower verification standards to reach the inventory number. Explicit rule — the gate is met by more verification, never by weaker verification.**

**Future considerations.** Whether permanent expansion should follow commute corridors rather than administrative boundaries.

---

### Decision 3 — Revenue model and paying party

**Decision.** The **landlord (or authorised broker) is the contractual paying customer**. Tenants pay **nothing** to search, view, or be matched — a permanent structural commitment, not a promotion. Public positioning: *"Free for tenants. We only earn when we successfully rent a property."* Both statements are true and must be reflected consistently in contracts, accounting, and marketing. Revenue is a **one-time success commission** earned on a completed let; it is **not recurring** — future monthly rent stays entirely between landlord and tenant unless the landlord later subscribes to a separate Property Management service.

**Reasoning.** Success-only, landlord-side commission makes ghost listings structurally unprofitable — revenue exists only when a real person moves in, so every company incentive aligns with what users want. Free tenant access removes friction on the harder-to-acquire side and accumulates the demand pool that gives the platform leverage over supply. The landlord is the recurring customer and the property-management pipeline; tenant relationships are episodic.

**Business implications.** All revenue is back-loaded to deal completion — working capital must fund verification and photography ahead of income. Landlord onboarding must overcome the market habit of not paying agents directly; the counter is to sell the *substitution* (a verified tenant with escrow-secured funds), not a new cost.

**Technical implications.** "Free for tenants" is marketing truth; the landlord is the legal payer and must be **named as such in the listing agreement** — withholding a fee from money owed to a third party without a contractual basis is conversion, not collection. Correct tax treatment (URA: defined customer, defined supply, VAT/withholding) depends on this.

**Risks.** Working-capital strain from front-loaded costs. Landlord resistance to a historically-unpaid fee. Both parties transacting outside the platform to avoid the fee (addressed by Decision 11).

---

### Decision 4 — Commission base and level

**Decision.** Commission is a **configurable multiple of the agreed monthly rental value**, recorded in a written listing agreement per property, defaulting to a company-set standard rate. The exact figure is **NOT frozen** — it will be validated through landlord interviews in the launch corridor before becoming permanent pricing policy. (Workshop analysis indicates the commercially sustainable level sits at or near the market letting-commission norm of approximately one month's rent; this is the validation hypothesis, not a locked figure.)

**Reasoning.** The dominant economic variable is **conversion rate, not commission rate** — at realistic launch conversion, the platform carries the cost of several verified listings per successful commission, so the fee must sit near the market norm to be viable, and effort is better spent raising conversion than raising price. Framing to landlords as an annualised percentage (≈8.3% for one month) is honest and reads as a normal agency fee; "one month's rent" reads as expensive for the same money.

**Business implications.** Founding-landlord launch concessions are permitted but must be **time-boxed, dated, and expressed as a discount off the standard rate** so they don't become the price. Commission is validated empirically before being fixed.

**Technical implications (hard constraints).**
- Commission rates are **configurable**, never hardcoded.
- The rate must be **snapshotted onto the deal at listing-agreement signing** — never looked up live. Changing the standard rate must not re-price deals in flight.
- Rates require **effective dates, version history, an audit trail, and immutability once a deal is in progress.**

**Risks.** Landlords in the corridor may currently pay agents nothing (brokers extract from tenants), making this a net-new cost — mitigated by selling the substitution, not lowering the fee reflexively.

---

### Decision 5 — Commission calculation base for multi-month advances

**Decision.** Commission is **always calculated from the agreed monthly rental value**, never from the total amount transferred into escrow. Whether the tenant pays 3, 6, or 12 months upfront plus a deposit, the commission base is the monthly rent.

**Reasoning.** Kampala mid-market landlords commonly demand several months in advance. Anchoring the fee to monthly rent keeps it legible, stable, and directly comparable to a broker's charge, and avoids both an arbitrary base and a perverse incentive to push tenants toward larger advances.

**Technical implications.** The deal model separates **monthly rental value** (the commission base) from **total upfront amount transferred** (the escrow inflow). These are distinct fields with distinct meanings; commission math references only the former.

---

### Decision 6 — Rentals vs. sales scope

**Decision.** Property **sales are OUT of Version 1**. V1 is **long-term residential rentals only** — no sale workflows, no sale escrow, no conveyancing/legal processes. The architecture must permit sales to be added later without major redesign.

**Reasoning.** Ugandan land sales carry title risk (mailo/kibanja complexity, forged titles, caveats, succession claims) that lettings do not; holding sale proceeds makes the platform a de facto conveyancing participant with matching liability, and the float rises by orders of magnitude with months-long cycles. Wrong risk to take before the core rental business is proven.

**Technical implications.** Domain model should not assume "rental" everywhere in a way that blocks a future "sale" transaction type — but **no sale logic ships in V1.** Listing type is extensible; transaction/escrow/legal flows are rental-only.

**Future considerations.** Sales re-enter the roadmap only after rentals are proven and the licensing/escrow posture can support high-value, long-held funds.

---

### Decision 7 — Escrow and payments custody

**Decision.** House For Rent **will not hold client funds directly.** It integrates with a **Bank of Uganda–licensed payment service provider / aggregator** that acts as custodian of escrowed funds. Natural Intellects Ltd owns a **reusable payment abstraction layer** that House For Rent uses for transaction orchestration (instruction, ledger, release logic); the regulated provider holds the money.

**Reasoning.** Under the National Payment Systems Act 2020, offering a payment service or operating a payment system without a Bank of Uganda licence is a criminal offence. Routing custody through a licensed partner keeps House For Rent out of unlicensed fund-holding while still delivering escrow's benefits (deposit-fraud protection for tenants, guaranteed collection for the platform). The abstraction layer is a company-level asset reusable by Smart Ride and others.

**Business implications.** Requires a commercial relationship with a licensed PSP/aggregator before launch. A lawyer must confirm the exact regulatory posture — this document is not legal advice.

**Technical implications (hard constraints).**
- **Escrow inflows are a liability (client money held), not revenue.** A double-entry ledger is required from day one, cleanly separating client money, commission receivable, and recognised revenue.
- **Commission is EARNED at tenant move-in, not at fund release.** Sequence: funds enter escrow → tenant moves in → commission earned → settlement releases funds. Revenue recognition follows this order.
- PSP integration sits **behind the company-level payments abstraction**, not wired directly into House For Rent.
- Release logic, dispute holds, timeout auto-release, and refund paths are all required.

**Risks.** Regulatory exposure if funds are ever held outside the licensed partner. Dependence on a third-party PSP's reliability and fees.

---

### Decision 8 — Broker participation and verification tiers

**Decision.** **Landlords are the preferred supply source.** Brokers are **accepted under stricter verification** — not excluded. A broker must **prove authority to market a specific property before its listing goes public.** Three verification tiers exist:

1. **Property Owner**
2. **Verified Broker / Agent**
3. **Property Management Company**

each with its own verification requirements.

**Reasoning.** Brokers control access to much of the inventory and accelerate supply, but are the largest source of fake and stale listings — chiefly by listing units they don't control. Requiring documented mandate before publication kills that fraud vector while keeping the supply channel open. This requires the verification model to distinguish **identity verification** (who you are) from **authority verification** (your right to market this property).

**Technical implications.** Lister accounts carry a **tier** and a **verification state**. Authority/mandate is a **per-property** attribute, verified before a listing is publishable, distinct from the lister's identity verification. A broker listing cannot go public without a recorded, verified mandate for that specific property.

---

### Decision 9 — Viewings and the Field Operations Officer

**Decision.** In V1, **House For Rent conducts every property viewing.** The role is the **Field Operations Officer (FOO)**, owning the complete field experience — not a "viewing agent." FOO responsibilities: property verification; professional photography and video capture; listing quality checks; availability confirmation; scheduled viewings; updating listing information; reporting on-site changes and issues. Combining these into one role per field visit is what makes the operating cost efficient.

**Scalability roadmap (architecture must support this evolution):**
- **Phase 1** — House For Rent conducts all viewings.
- **Phase 2** — Certified Partner program: vetted landlords/property managers may conduct approved viewings under House For Rent policy after meeting strict standards.
- **Phase 3** — Hybrid: House For Rent retains new, premium, and high-risk listings; certified partners handle qualifying properties, under periodic audits and quality monitoring.

**Reasoning.** The viewing is the moment of truth — where fraud, wasted transport, and stale-listing failures occur, and where circumvention would otherwise begin. Company-conducted viewings turn the biggest liability into the product ("our officer meets you, on time, and it is exactly as photographed"), produce ground-truth availability as a free by-product, and create the evidential record that makes the circumvention clause enforceable. Corridor contiguity (Decision 2) is what makes the field-team cost viable. Verification has a manual floor; this is it — trust is bought with feet, and the automation opportunity is in routing/scheduling/dispatch, not in removing the human.

**Business implications.** The FOO is hired for judgment and representation, not key-holding. This is the largest recurring operating cost and the primary control point over circumvention.

**Technical implications.** A scheduling/dispatch subsystem is required. **Every viewing produces a timestamped introduction record and a structured field report** (not free text): condition, accuracy-vs-listing, availability, issues, timing. This structured capture must exist **from day one** because it is the baseline that later defines Certified Partner standards — you cannot certify against a standard you never measured.

---

### Decision 10 — Tenant screening

**Decision.** V1 screening is **identity-only.** Every tenant completes: government identity verification (National ID / NIN), phone verification, selfie-vs-ID match, and basic profile information. **Ability to pay is proven structurally by escrow funding** — a tenant who has funded the required rent and deposit has demonstrated capacity more convincingly than any forgeable payslip. V1 does **not** collect or permanently store employment documents, salary information, bank statements, or landlord references in the standard workflow.

**Reasoning.** Escrow already produces the most valuable screening signal (can they pay) for free. Behavioural history is low-quality and high-liability in a market with no rental credit bureau — references mean phoning a potentially biased or fabricated prior landlord. Identity-only keeps the data-protection posture proportionate to the value gained.

**Business implications.** The landlord's pitch is a named, government-identified tenant whose funds are confirmed and held — already more than a broker ever offered. Enhanced screening becomes a **future paid landlord feature**, built on the transaction/rental history the platform uniquely accumulates.

**Technical implications (hard constraint).** Screening is built as a **modular, pluggable pipeline** — "identity-only" is a *configuration* of the pipeline, so enhanced modules (employment verification, references, rental history, AI risk scoring) are added later as **optional/premium services** without redesigning the tenant flow. Handling NINs triggers the **Data Protection and Privacy Act 2019** — registration with the Personal Data Protection Office, lawful basis, explicit consent, purpose limitation, retention limits, and breach obligations apply.

---

### Decision 11 — Circumvention model

**Decision.** The goal is **not** to eliminate circumvention (unrealistic in a physical property business) but to make House For Rent the safest and easiest way for both parties to transact. V1 adopts a combined model:

**Tenant value — Move-In Guarantee, on platform-settled deals only.** Scope limited to: the property exists; the property matches its verified listing; the property is available; and tenant funds remain protected until successful move-in. This guarantee applies **only** when settlement occurs through House For Rent. It is **property-integrity cover backed by held escrow funds — it requires no reserve fund in V1** (you only ever return money already held). It explicitly does **not** guarantee tenant *conduct* to the landlord (rent default, damage) in V1 — that is an insurance product requiring a reserve and actuarial pricing, which identity-only screening cannot underwrite.

**Landlord value.** Verified tenants; escrow-proven available funds; professional FOO support; faster occupancy; reduced fraud risk; professional property presentation.

**Landlord stick — circumvention clause.** Every listing agreement contains a clause covering tenants introduced by House For Rent: if the landlord transacts directly with a House For Rent–introduced tenant (evidenced by the FOO's timestamped introduction record), the full commission remains due. The clause is enforceable *because* the FOO creates the introduction record.

**Structural default — sequenced introductions.** Contact is defaulted through the platform, not the gate, wherever the flow allows — making the easy path the compliant path and requiring deliberate joint effort to bypass.

**Reasoning.** A two-party cash deal cannot be policed; the winning move is to make on-platform strictly better for each side independently, backed by a modest contractual stick for the large, provable cases. The Move-In Guarantee is fraud protection tenants would otherwise pay a broker for; surrendering it is the cost of a side deal. The clause converts big bypass cases into a collectable debt. Perfect prevention is impossible (people exchange numbers — physics); the realistic win is making compliance the default and the biggest leaks recoverable.

**Business implications.** A measured leakage rate is a cost of doing business and must be built into unit economics — not chased to zero. The clause is a deterrent and a tool for large cases, not the basis for a V1 collections operation (enforcement via small claims/arbitration is slow and may cost more than the commission).

**Technical implications.** The **timestamped introduction record** and **structured field report** from Decision 9 are the evidential spine — introduction evidence, availability confirmation, listing-quality measurement, certification data, and operational analytics all derive from them. The Move-In Guarantee is a state in the deal machine tied to escrow release, not a separate financial product in V1.

**Future considerations.** A conduct-level guarantee and deeper screening are revisited **together** in a later version, once the platform holds enough transaction history to underwrite them.

---

## 5. Cross-cutting engineering constraints (consolidated)

These recur across decisions and are collected here so the AI coder cannot miss them:

1. **Money.** Escrow inflow is a **liability**, not revenue. Double-entry ledger from day one. Commission **earned at move-in**, released at settlement. Custody sits with a licensed PSP behind a company-level payments abstraction.
2. **Commission rate.** Configurable; **snapshotted onto the deal at agreement signing**; versioned with effective dates and audit trail; immutable once a deal is in progress. Commission base is **monthly rent**, held separately from **total upfront transferred**.
3. **Verification.** Distinguish **identity** verification from **authority/mandate** verification. Lister tiers (Owner / Broker-Agent / Management Co). Mandate is per-property and pre-publication.
4. **Screening.** Modular pipeline; identity-only is a configuration; DPA 2019 compliance from the start.
5. **Geography.** Configurable service-area boundary; neighbourhood-taxonomy-first location model; availability is a first-class expiring attribute.
6. **Field operations.** Structured field reports and timestamped introduction records from day one — they underpin availability, circumvention enforcement, and future partner certification.
7. **Extensibility without premature build.** Listing tiers and a future sale transaction type must be *possible* in the model, but **no premium operation and no sale logic ship in V1.**
8. **Reusability.** Identity/verification and payments are **Natural Intellects company-level services**, with House For Rent as first consumer — not House-For-Rent-only implementations.

---

## 6. Explicitly deferred (post-V1 roadmap)

Introduced only once transaction history and operational maturity exist: enhanced/modular tenant screening and AI risk scoring; tenant reputation history; Certified Partner landlord program (viewing Phases 2–3); expanded guarantees including tenant-conduct cover; property management service (recurring revenue); property sales; budget and student segments; additional corridors; full premium-tier operation; diaspora-tenant remote transacting and cross-border payments.

---

## 7. Open items with defined validation paths (not frozen)

| Item | Status | How it closes |
|---|---|---|
| Exact commission figure | Hypothesis: ≈ one month's rent / ≈8.3% annualised | Landlord interviews in the launch corridor |
| Launch inventory gate number | Provisional: ~40–60 live verified listings | Finalised at unit-economics validation |
| Corridor boundaries | Provisional: Ntinda–Kira belt | Refined by actual landlord acquisition and market feedback |
| Leakage-rate assumption | Undefined | Set during unit-economics modelling |
| Refunds on collapsed funded deals; who absorbs mobile-money fees; dispute-resolution timelines | Undefined | Resolved during PRD phase |

---

## 8. Required next actions before/alongside implementation

1. **Legal review** of: escrow/PSP arrangement under the NPS Act 2020; the circumvention clause's enforceability; DPA 2019 registration and compliance; correct URA tax treatment of the commission.
2. **PSP/aggregator selection** — a licensed custodian partner must be chosen before escrow can function.
3. **Unit-economics model** — cost per verified listing, cost per deal, conversion assumptions, leakage rate, break-even volume; this finalises the launch gate number and the expansion-trigger threshold.
4. **Landlord interviews** in the corridor — validate the commission figure and the willingness to pay a landlord-side fee.

---

## 9. Amendment log

| Date | Decision affected | Change | Reason |
|---|---|---|---|
| *(freeze date)* | — | Initial freeze of all 11 decisions | End of Business Discovery workshop |

*Any future change to a frozen decision is recorded here as a dated amendment. Implementation must never silently diverge from a frozen decision.*
