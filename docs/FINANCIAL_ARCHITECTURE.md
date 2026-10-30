# Financial Architecture Foundation — Assessment & Design

**Task:** Financial architecture foundation (approved business policies → domain foundation).
**Date:** 2026-10-30 · **Mode:** extend the existing system, never rebuild. No live money moved; no
production schema pushed; the migration ships as a reviewed file, unapplied (owner-gated rails:
`scripts/apply-migration.mjs` + `ALLOW_PROD_MIGRATION=yes`).

---

## 1. Initial architecture assessment (what exists before this task)

### What already exists and is sound

| Component | Where | Verdict |
|---|---|---|
| Double-entry ledger, single writer `post()` (≥2 legs, all amounts > 0, Σdebit = Σcredit, validated **before** any write; entries never edited/deleted; corrections = reversing postings) | `src/server/ledger.ts` | **Reuse as-is.** This is the spine. |
| Typed ledger accounts (bigint shillings, no float anywhere) | `ledger_account` / `ledger_entry` (🔒 immutable) | Reuse; classification extended (below). |
| Deal state machine (`ALLOWED_TRANSITIONS`), deliberately no `escrow_funded → settled` edge, no `escrow_funded → cancelled` (Amendment A1) | `src/server/domain.ts` | Reuse; extended additively (below). |
| Snapshots at signing: `monthly_rent_snapshot`, `commission_rate_bp_snapshot`, immutable thereafter (`SnapshotImmutableError`) | `deal` + `signAgreement` | Reuse; **incomplete — extended** (gap G-1). |
| Commission engine: pure function over the deal's own snapshots, integer truncating division | `computeCommission` | Reuse unchanged. |
| Immutable PSP instruction boundary + append-only event log; idempotency keys; derived current state | `psp_instruction` / `psp_instruction_event`, `ledger.ts` | Reuse unchanged. |
| Signature-verified Nylon Pay webhook: HMAC over raw body, 5-min freshness, 503 fail-closed, money guard (UGX + exact amount else NOT booked + audit), terminal-state refusal, booking-failure audit | `webhook/route.ts`, `applyPspWebhookOutcome` | Reuse; extended with pending-state handling (below). |
| Atomic transitions: status + immutable `deal_transition` + ledger posting + audit event in ONE transaction; PSP network calls issued BEFORE the tx opens | `applyTransition` + preflight pattern | Reuse unchanged. |
| Reconciliation (postings balance; PSP-succeeded collects == ledger inflow), persisted `reconciliation_check` | `ops.ts runReconciliation` | Reuse; scope extended (below). |
| Authorization: single-source `DEAL_ACTIONS` role matrix rendered by UI **and** re-checked per request; party scoping; 404-not-403 | `domain.ts`, `[action]/route.ts` | Reuse; new actions follow the same table. |
| Append-only audit (`audit_event`), money events audited in the same tx with amounts as strings | `applyTransition` | Reuse. |

### Gaps found (this task closes them)

| # | Gap | Evidence | Resolution |
|---|---|---|---|
| G-1 | **Snapshot incompleteness / re-pricing window.** Funding derives `monthlyRentSnapshot × listing.requiredMonthsUpfront + listing.depositAmount` — months and deposit are read from the **live listing** at fund time, so a listing edit between signing and funding silently re-prices an existing transaction (rent alone is tripwired; F-5 in the audit register notes the same window) | `deals.ts` `fundEscrow`/`applyEscrowFunding` | Snapshot `advanceMonths`, `advanceRent`, `depositAmount`, `commissionPayer`, mutual-agreement ref and policy tokens onto the deal at signing; funding derives **only** from the deal's own snapshots |
| G-2 | **No >3-months mutual-agreement control.** `requiredMonthsUpfront` accepted 1–24 with no recorded agreement | `amendListing`/`createListing` | `advanceMutualAgreementRef` required (422) for >3 months; snapshotted onto the deal at signing |
| G-3 | **Deposit not a separate financial lifecycle.** Deposit is lumped into one generic `escrow_liability` with rent; settlement pays the **whole** outstanding balance (deposit included) to the landlord | `ledger.fundEscrow`, `applySettlement` | New `rent_escrow_liability` + `deposit_liability` classifications; new-shape deals split the funding posting; settlement pays **net rent only**; deposit gets its own lifecycle (Section 5) |
| G-4 | **Commission earned at the wrong moment.** Old flow earned commission at an admin action after move-in; approved policy: commission is earned at **confirmed payment** | `earnCommission` (post-move-in) | Commission is recognised inside `applyEscrowFunding` — the only place custody is ever booked, which runs only on provider-confirmed money (mock-instant or verified webhook). Reversal allowed only for the approved categories |
| G-5 | **Move-in was a single tenant click.** No landlord participation, no evidence, no window, no dispute path, no recorded decision | `confirmMoveIn` | Full move-in verification lifecycle (Section 4) |
| G-6 | **Refund was full-and-only.** No partial refunds, no kinds (duplicate payment, deposit refund), no refund record, no pending-state visibility | `refund` | Refund records with kinds + states, pending/failed visibility, partial support with server-side bounds |
| G-7 | **No provider-fee accounting.** HFR bears processing fees but nothing recorded them | — | `psp_fee_expense` classification + `recordProviderFee` primitive (posted only from verified provider data; never fabricated) |
| G-8 | **No provider-reversal path.** A provider clawback had no representation | — | Reversal engine (Section 6): reversing postings + `FinancialAdjustment` records + terminal `reversed` status (pre-settlement) or `financial_review_required` (post-settlement) |
| G-9 | **No post-settlement refund representation.** After settlement the landlord is contractually responsible for unearned prepaid rent; nothing tracked that coordination | — | `post_settlement_refund` records — explicitly **not** an HFR liability, never a ledger balance (no artificial guarantee balance) |
| G-10 | **Policy gaps were implicit.** Response windows, deadlines, cancellation/retention rules pending business approval had nowhere to live | — | Named config keys (unset = not enforced) + an explicit `PENDING_POLICY_APPROVALS` registry surfaced by the finance overview (Section 8) |

### Deliberately NOT built (and why)

- **No payment-provider selection or custody claim.** Nylon Pay collections exist behind the honest
  sandbox/live seam; payout dispatch remains unwired (release/refund instructions park `pending`).
  No surface may claim regulated custody — the provider's custody/release capability is an explicit
  pending approval (`deposit_custody_provider_confirmed`, default **false**).
- **No new financial admin dashboard.** The domain foundation ships read APIs only; the existing
  platform console keeps working (labels extended).
- **No `financial_reviewer` role.** `auth_role` is a production Postgres enum behind login checks;
  adding a role is an owner decision. Every new restricted action is admin-gated, which preserves
  the required separation (an officer submits evidence; they never gain settlement authority).
- **No recurring/renewal commission path** — policy says none exists; nothing to build, and the
  one-commission-per-deal invariant is structural (commission posts only from deal snapshots once).

---

## 2. Financial domain architecture (the 12 concepts)

| Concept | Responsibility | Where it lives | Lifecycle |
|---|---|---|---|
| 1. Rental transaction | The agreement between the parties; carries the immutable financial snapshot | `deal` (+ new snapshot columns) | deal state machine |
| 2. Rent collection | Moving the tenant's rent into custody | `fund_escrow_split` posting → `rent_escrow_liability` | agreement_signed → payment_pending → escrow_funded |
| 3. Security deposit | Custody of the deposit, separately from rent | `deposit_liability` + `deposit_case` / `deposit_deduction` | Section 5 |
| 4. Platform commission | 10% of one month's rent, landlord-paid, earned at confirmed payment | `commission_revenue` posting at funding; `deal.commission_amount` | earned at funding; reversible only per approved categories |
| 5. Payment processing fees | HFR-borne provider costs, recorded as operating expense | `psp_fee_expense` postings | recorded when verified provider data exists |
| 6. Landlord settlement | Net rent to landlord after **verified** move-in | `settle` + `release_to_landlord` postings from `rent_escrow_liability` | move_in_confirmed → settlement_pending → settled |
| 7. Refund | Returning money to the tenant, with kind + record | `refund_record` + `refund` postings | pending → confirmed/failed; full/partial |
| 8. Payment reversal | Provider clawback of a confirmed collection | reversing postings + `financial_adjustment` | pre-settlement: `reversed`; post-settlement: review |
| 9. Financial adjustment | The recorded decision behind any correction | `financial_adjustment` (+ audit) | created with its posting; immutable |
| 10. Dispute | A party conflict freezing money movement | `move_in_disputed` / `dispute_hold` / deduction dispute | Section 4/5 |
| 11. Reconciliation | Ledger ↔ provider ↔ internal consistency checks | `runReconciliation` (extended) + `reconciliation_check` | on demand; persisted |
| 12. Financial audit record | Who did what to which money, when, why | `deal_transition`, `audit_event`, all workflow records | append-only |

**Money identities kept distinct** (never one generic escrow balance): collected (fund postings),
held by provider (`psp_clearing` net), owed to landlord (`landlord_payable` / outstanding rent
liability), owed to tenant (outstanding rent + deposit liabilities), commission earned
(`commission_revenue`), fees borne (`psp_fee_expense`), settled (`release_to_landlord` credits),
refunded/reversed (refund postings + reversal postings), disputed (deal state + workflow records).
Internal ledger records are always kept conceptually separate from provider-held funds —
reconciliation compares, it never asserts.

---

## 3. Ledger & accounting model

### Account classification (additive)

| Account type | Meaning | Posting pattern |
|---|---|---|
| `psp_clearing` | money the provider actually holds for this deal | debit on confirmed collect; credit on release/refund/fee |
| `rent_escrow_liability` | rent-side money owed back per the deal's signed terms | credit at funding; debit at commission/settlement/refund |
| `deposit_liability` | deposit-side money in custody (separate lifecycle) | credit at funding; debit at deposit release/deduction |
| `escrow_liability` | **legacy only** — pre-migration deals keep their existing postings untouched | unchanged |
| `commission_revenue` | HFR commission earned | credit at funding; debit on approved reversal |
| `landlord_payable` | settlement instructed, payout in flight (or deposit deduction payable) | credit at settle; debit at release |
| `psp_fee_expense` | provider processing fees borne by HFR | debit at fee recording; **never** charged to tenant/deposit |
| `commission_receivable` | reserved (unchanged) | — |

### Canonical postings (new-shape deal)

```
funding (confirmed payment):
  debit  psp_clearing            advanceRent + deposit
  credit rent_escrow_liability   advanceRent
  credit deposit_liability       deposit
commission (same transaction as funding — earned at confirmed payment):
  debit  rent_escrow_liability   commission = monthlyRent × rateBp / 10000
  credit commission_revenue      commission
settlement (verified move-in; RENT SIDE ONLY):
  debit  rent_escrow_liability   outstanding rent liability
  credit landlord_payable        same
  debit  landlord_payable        same        (release)
  credit psp_clearing            same
refund (kind full / partial):
  debit  rent_escrow_liability   amount
  credit psp_clearing            amount
deposit release to tenant / approved deduction:
  debit  deposit_liability       amount
  credit psp_clearing            amount       (tenant)  — or → landlord_payable + release (deduction)
provider fee (verified source only):
  debit  psp_fee_expense         amount
  credit psp_clearing            amount
provider reversal (pre-settlement):
  exact reversing postings of funding and commission + `reversed` terminal status
```

Invariants carried over unchanged: every posting ≥2 legs, all amounts > 0, Σdebits = Σcredits,
validated pre-write; corrections are new reversing postings; bigint shillings; every entry carries
`deal_id` + a `reference` naming the posting kind **and the PSP instruction id** where applicable
(`fund_escrow:{instructionId}` …) so entries trace to the originating transaction and provider
reference. Duplicate payment events cannot double-post: instruction idempotency keys, the
`(instruction, to_state)` unique, terminal-state refusal, and the deal-status guards all stand;
a late duplicate confirmation is audited (`psp_duplicate_collect_confirmation`) and the
collects-side reconciliation flags any provider-side excess.

**Commission earning vs retention are distinct concepts:** earning is the funding-time posting;
retention is governed by reversal/adjustment, which is only legal for the approved categories —
`landlord_failure_to_provide_property` and `provider_payment_reversal` — everything else is
refused with `COMMISSION_RETENTION_POLICY_PENDING` rather than invented.

---

## 4. Move-in verification (new lifecycle)

`move_in_verification` — one per deal. Opened by the tenant's confirm action (or an admin).

- Both parties independently confirm (note + optional evidence media ref) or dispute (reason +
  evidence required). Evidence is stored on the record and audited.
- **Silence never auto-confirms.** There is no timer that flips state by itself.
- **Silence never blocks forever:** an admin decides `verified` / `not_verified` with a recorded
  reason at any point after opening — the response window, when business approves one
  (`movein_response_window_hours`, unset = awaiting approval), is surfaced as context for that
  decision, never a hidden automaton.
- Conflicting evidence → `move_in_disputed` → admin review decision, recorded with reasons.
- Verified ⇒ deal → `move_in_confirmed`, which is the only gateway to settlement. A Field
  Operations Officer may attach evidence but the decision and every settlement authority remain
  admin-only.

States: `open → tenant_confirmed / landlord_confirmed → verified`; any party → `disputed`;
admin → `under_review → verified / not_verified`.

## 5. Security deposit lifecycle (new)

`deposit_case` (one per deal, created at funding) + `deposit_deduction` rows.

held → (landlord proposes deduction: amount ≤ held, reason, evidence) → HFR review (admin
approve/reject with reason) → tenant accepts or disputes → approved+accepted → **apply**:
`debit deposit_liability / credit psp_clearing` (un-deducted balance back to tenant) and, for the
approved deduction, `→ landlord_payable → psp_clearing` (paid to landlord). Partial releases and
partial deductions are first-class (each deduction is its own amount). Balance zero → case closed.
Normal wear-and-tear is review guidance recorded in the action consequence, not a code rule;
deduction deadlines and legal limits are pending-approval config keys, not hardcoded numbers.

## 6. Refund & reversal architecture

`refund_record` rows: kind `full_pre_settlement | partial_pre_settlement | duplicate_payment |
deposit_refund`, state `pending → confirmed | failed`, amount, reason, actor, instruction link.
Partial refunds are admin actions whose amount is validated against the live outstanding liability
(a human decision, but bounded server-side and fully audited). Refund before settlement debits
`rent_escrow_liability`; refund after settlement is a landlord contractual matter recorded as a
`post_settlement_refund` — **never** an HFR liability, never a ledger balance, and resolved only to
states that name what actually happened (`resolved_paid_by_landlord`, `resolved_waived_by_tenant`,
`escalated`). Provider reversals: pre-settlement = exact reversing postings + terminal `reversed`;
post-settlement = `financial_review_required` + adjustment record, no automatic money movement.
Unresolved cancellation/retention categories stay explicit policy gaps (Section 8).

## 7. State machine (additive extension)

New statuses: `payment_pending`, `move_in_awaiting_verification`, `move_in_disputed`,
`settlement_pending`, `refund_pending`, `partially_refunded`, `financial_review_required`,
`reversed`. All previous edges and terminal rules are untouched; `partially_refunded` deliberately
exists as a deal status because a partially-refunded deal continues its journey (the refund
*records* carry the amounts). `financial_review_required` is the ops-visible flag for money-guard
anomalies; resolving it restores the prior status read from transition history (the established
`resolveDispute` pattern). Every new edge is listed in `ALLOWED_TRANSITIONS`; nothing else moves.

## 8. Decisions that remain configurable or pending (the honest list)

Registry: `PENDING_POLICY_APPROVALS` (`src/server/finance/policy.ts`), surfaced by
`GET /api/v1/admin/finance/overview`. Config keys (append-only `config_parameter`/`config_version`;
unset = not enforced + surfaced as pending): `movein_response_window_hours`,
`deposit_inspection_deadline_days`, `deposit_refund_deadline_days`,
`deposit_custody_provider_confirmed` (default **false** — no real deposit collection until the
provider's custody capability is verified and the legal structure is approved).

Pending business approvals: exact move-in response window; deposit inspection/refund deadlines;
tenant-initiated cancellation rules; commission retention beyond the two approved categories;
dispute escalation deadlines; provider-specific custody/release capabilities; legal approval of the
payment & custody structure.

## 9. Security & compliance boundaries (preserved + extended)

No provider credentials in code; no PIN/OTP/card storage; browser redirects are not proof of
payment (custody books only on signature-verified, amount-matched webhook confirmations); webhook
verification untouched; private records party/admin-scoped (404-not-403 for non-parties; deposit
and verification records follow the same rule); no escrow/custody licensing claims; no real-money
tests (sandbox mock self-labels MOCK in the database); no live settlement or deposit custody
enabled. New money paths run inside the same single-transaction, audited, server-derived-amount
discipline as the existing ones.
