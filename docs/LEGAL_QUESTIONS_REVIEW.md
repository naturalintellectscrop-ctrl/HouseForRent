# Open Legal Questions — Decision Matrix

**Owner:** Natural Intellects Ltd (NI) · **Prepared by:** engineering (launch-gate round 2) · **October 2026**

The legal pages (`/terms`, `/privacy`) print every unsettled question as a visible callout. This
document reviews all **12** of them (the 12 sub-questions inside the 6 printed callouts —
3+2+2+3+2), states what the product does **today**, who must resolve each one, and what each
blocks. Nothing here is legal advice or legal approval; the callouts stay on the pages until
counsel has actually reviewed the text.

---

## A. Privacy (Uganda Data Protection and Privacy Act, 2019)

### A1–A3. Erasure vs append-only evidence (one callout, three sub-questions)

| # | Sub-question | Product today | Resolved by | Blocks |
|---|---|---|---|---|
| A1 | What **can** be erased? | Nothing is ever erased; evidence tables (audit_event, ledger, agreements…) are append-only by design | **Counsel** interprets the Act against the append-only design; engineering implements the resulting schedule | Real personal data at scale |
| A2 | What **must** be retained (and for how long)? | Retention statements on /privacy describe intent, not a reviewed schedule | **Counsel** (statutory retention for money/identity records); NI ratifies | Real personal data at scale |
| A3 | Manual **SAR/erasure process**? | None automated; "contact us" only | NI decides the process; counsel reviews; engineering builds the tooling | Real personal data at scale |

### A4–A5. Subject-access requests: timelines and identity-proofing

| # | Sub-question | Product today | Resolved by | Blocks |
|---|---|---|---|---|
| A4 | SAR **response timelines** | No committed timeline on the page | **Counsel** (statutory deadline under the Act); NI commits publicly | Real personal data at scale |
| A5 | SAR **identity-proofing steps** | Interim: verify by account phone number | **Counsel** (adequacy under the Act); NI approves the interim→final path. Depends on the real identity provider replacing the sandbox mock | Real personal data at scale |

**Engineering dependency for the whole block:** no erasure/SAR tooling exists yet; the identity
provider is still the disclosed sandbox mock.

## B. Terms of service

### B1–B2. Minimum age

| # | Sub-question | Product today | Resolved by | Blocks |
|---|---|---|---|---|
| B1 | Is there a **minimum age**? | No stated age requirement anywhere | **NI business decision** (counsel advises on the legal minimum and consequences) | Limited: none hard-blocked; settle before public launch marketing |
| B2 | How would it be **enforced**? | Practical gate = a NIN that passes the structural identity check (self-declaration provider) | **Counsel** (whether that gate is defensible); NI accepts the residual risk or defers sign-ups | Same as B1 |

### B3–B5. Escrow release terms (money)

| # | Sub-question | Product today | Resolved by | Blocks |
|---|---|---|---|---|
| B3 | Precise **escrow release conditions** | Escrow only on deals whose written agreement records the terms explicitly | **Counsel drafts → NI approves** | **Real money — hard block** |
| B4 | **Dispute windows** | Not defined | **Counsel drafts → NI approves** | **Real money — hard block** |
| B5 | **Partial settlements** treatment | Not defined | **Counsel drafts → NI approves** | **Real money — hard block** |

### B6–B7. Liability

| # | Sub-question | Product today | Resolved by | Blocks |
|---|---|---|---|---|
| B6 | **Liability cap** amount | The ledger's own records are authoritative for money; no cap clause yet | **Counsel** | Real money (and arguably before wide public launch) |
| B7 | Are consumer-protection **implied terms non-excludable**? | Unreviewed | **Counsel** | Same as B6 |

### B8. Dispute forum

| # | Sub-question | Product today | Resolved by | Blocks |
|---|---|---|---|---|
| B8 | Courts vs **arbitration venue and seat** | Not stated | **Counsel recommends → NI decides** (business preference among lawful options) | Real money — hard block |

---

## Summary — who decides what

| Owner of the decision | Items |
|---|---|
| **Legal counsel** (interpret/draft) | A1, A2, A4, A5, B2, B3, B4, B5, B6, B7, B8 (recommendation) |
| **Natural Intellects** (business decision, informed by counsel) | B1, B8 (final choice), ratification of A1–A5 outputs, the SAR process (A3) |
| **Engineering** (after the above) | erasure/SAR tooling, minimum-age gate, escrow-terms surfacing in the deal flow |

## Launch-stage mapping (the three published stages)

1. **Limited public website (live now):** no open question hard-blocks it — the pages carry honest callouts, and no real money moves.
2. **Accepting real personal data (at scale):** resolve **A1–A5** first (counsel), plus **B1–B2** before marketing. The platform already holds small amounts of personal data (phone numbers); scale-up is what demands the settled posture.
3. **Real money:** **B3–B8 are hard prerequisites** — no escrow-funded deal should move real funds until the release conditions, dispute windows, partial-settlement terms, liability cap and forum are counsel-reviewed and NI-approved. (NylonPay merchant KYC is the parallel external gate — see docs/NYLONPAY_GOLIVE.md.)

## Honest state of the texts themselves

Both pages are engineering-drafted and **unreviewed by any lawyer**. The callouts make that
visible to users; this document does not change that. After counsel review, update the pages
**and delete the resolved callouts in the same commit**, so the pages never claim more than
counsel has actually approved.
