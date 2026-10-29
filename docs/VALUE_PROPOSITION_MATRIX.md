# Value Proposition Matrix — what the platform may claim, with evidence

**Task ID:** 5 (Phase 5) · **Date:** 2026-10-28. Each differentiator is classified as
**VERIFIED-IMPLEMENTED** (browser/API evidence in this repo) · **PARTIALLY-IMPLEMENTED** ·
**PLANNED-OR-MOCK** · **EXTERNAL-DEPENDENCY-BLOCKED** · **NOT-IMPLEMENTED**.
The governing rule: **UI copy may never claim more than the rightmost column proves.**

| # | Differentiator | Classification | What actually exists (evidence) | What the copy MAY say | What it must NOT say |
|---|----------------|----------------|----------------------------------|------------------------|----------------------|
| 1 | Trust via verification | **VERIFIED-IMPLEMENTED** (process) / **MOCK** (identity of persons) | The LISTING trust ladder is real and live-tested: publish gate = field verification + service area + agreement + photography, one implementation three consumers (`listings.ts:549`), E2E: unverified publish refused, verify→live→public "Verified in person" badge (matrix 3.3/3.4/7.11). PERSON identity is the disclosed sandbox mock (`ops.ts:36-42`). | "No home is published until a field officer has visited, photographed and confirmed it"; "Every listing carries a verification verdict and an availability date" | "Every landlord is identity-verified against the national register" (mock provider; blocker #2) |
| 2 | Payment protection | **PLANNED-OR-MOCK** (real money semantics) | The ledger/state machine is genuinely built: server-derived amounts, snapshots, double-entry, refund/settle invariants (docs/FINANCIAL_AUDIT.md I-1…I-10). But the PSP is the sandbox mock; live payouts are unwired; NylonPay KYC is blocker #1. **This is NOT legal escrow** (audit §0). | "Your upfront payment is recorded as a liability we owe back, and it is only released after you confirm move-in — the ledger is the authority" (about internal accounting) | "Escrow with a licensed custodian", "guaranteed refunds", "your money is held by a bank", anything implying third-party custody exists today |
| 3 | Transparency | **VERIFIED-IMPLEMENTED** | Ledger-derived figures on every money surface (console = books, `deals.ts:653-678`); publish blockers shown to the landlord verbatim (dry-run, E2E step 4); amendment trail with changed-field lists; honest empty states observed live ("publishes only homes our officers have visited" empty search; provider-status honesty block on the control center); audit trail with actor on every consequential action. | "You can always see why a listing is or is not live, and where every shilling stands in our books" | "Real-time provider sync" (mock PSP), "instant" anything |
| 4 | Human assistance | **VERIFIED-IMPLEMENTED** (operations exists) / **PARTIAL** (scale) | Real roles: field officers visit/verify (E2E step 8+12); admins approve people, place dispute holds, settle; viewing dispatch with scheduled slots (`ops/dispatch`); introduction records as circumvention evidence (`viewings.ts:587+`). Single-tenant-of-one-rig scale; no SLA exists. | "A real person from our team visits every property and handles the deal end to end" | "24/7 support", response-time promises |
| 5 | End-to-end management (viewing → deal → keys) | **VERIFIED-IMPLEMENTED** (state machines) / **PARTIAL** (mobile money prompt UX in live mode) | Viewing state machine (requested→scheduled→conducted→no-show), introduction→deal→funding→move-in→settlement chain with named actions and consequences shown before acting (`DEAL_ACTIONS` catalogue, E2E + round-49 rails); dispute-hold/resolve restores prior status from history. | "The whole journey — viewing, agreement, payment record, move-in — runs through one system with every step recorded" | "Fully automated" (officers/admins act manually by design) |
| 6 | Accountability | **VERIFIED-IMPLEMENTED** | Immutable deal transitions + audit events with actor identity in the same transaction as every money event (`deals.ts:929-988`); account decisions carry actor+reason on the trail (round 49); application decisions are concurrency-safe (409 on stale); webhook anomalies land in queryable audit rows (`psp_amount_mismatch`, `psp_terminal_refused`, `psp_booking_failed` — round 50); every posting balances and reconciliation reports honestly (`ops.ts:259-291`). | "Every decision and every shilling movement is attributable to a named actor in an immutable record" | "publicly auditable" (the ledger is internal; no external auditor exists yet) |

## Cross-cutting copy rules (enforced by review; violations = defect)

1. **No "every listing is verified" in the absolute present** until production has ≥1 real
   verification — currently true on the rig and by construction of the gate, but production data
   is the test (matrix 3.4 prod column still UNVERIFIED).
2. **"Escrow"** may only appear as an internal-accounting explanation ("recorded as a liability we
   owe back"), never as a custody/brand claim, until blocker #1 closes AND counsel signs off
   (docs/LEGAL_QUESTIONS_REVIEW.md).
3. **Identity verification claims** must carry the mock-provider disclosure wherever the
   verification status of a PERSON is shown (the UI already does this — preserved).
4. **No superlatives without a number**: "instant approval", "guaranteed", "secure escrow",
   "bank-grade" are banned vocabulary.
5. **The homepage trust line** ("We do not publish a listing until one of our field officers has
   visited the property, photographed it, and confirmed with the landlord that it is genuinely
   available") is EVIDENCE-BACKED (7.11/7.12) and may stand.
