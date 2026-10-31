# Financial System Audit — Threat Model, Invariants & Findings Register

**Task ID:** 4 (Phase 4 of the redesign brief) · **Date:** 2026-10-28 · **Scope:** full financial
lifecycle, code-level audit of every file that touches money. **No real payment was initiated**;
no production data was written (this audit read code; DB access was read-only where used).

---

## 0. What this system IS and IS NOT (read this first)

**It IS:** an internal double-entry ledger (`ledger_entry`), a deterministic deal state machine
(`ALLOWED_TRANSITIONS`, `src/server/domain.ts:119`), an immutable PSP instruction boundary
(`psp_instruction` + append-only events), and a signature-verified webhook intake. Money figures
are bigint integer shillings end-to-end; no float participates in any money path.

**It IS NOT legal escrow.** The word "escrow" in the schema names an internal *liability account*,
not a custody arrangement with a regulated third party. The intended custodian is **Nylon Pay**,
which is **not yet contracted for real money**: KYC/merchant approval is standing blocker #1, the
live payout dispatch is deliberately unwired (release/refund instructions park `pending`,
`src/server/ledger.ts:444-466`), and the default mode is the sandbox mock which labels every
instruction MOCK in the database itself (`src/server/ledger.ts:350-356`). The UI states this
honestly (control-center provider-status block). **No surface may claim bank-grade escrow,
guaranteed refunds, or that client money is held by a third party until blockers #1 closes and
counsel reviews the escrow questions.**

---

## 1. Lifecycle map (verified paths, with evidence)

| # | Step | File | Authorization | Money effect |
|---|------|------|---------------|--------------|
| 1 | Deal created FROM an introduction record — every party derived server-side; no client-namable party field | `src/server/deals.ts:160-201` (`createFromIntroduction`) | `POST /api/v1/deals` → foo/admin; officer must own the introduction (`NotTheIntroducingOfficerError`) | none |
| 2 | match-tenant: created→tenant_matched; requires introduction record | `deals.ts:206-225` | foo, admin (`DEAL_ACTIONS`, `domain.ts:237-249`) | none |
| 3 | sign-agreement: **THE SNAPSHOT POINT** — rent + commission bp frozen onto the deal, immutable thereafter (`SnapshotImmutableError` on re-sign) | `deals.ts:231-274` | lister (must be a deal party), admin | none |
| 4 | fund-escrow: amount **DERIVED** = `monthlyRentSnapshot × requiredMonthsUpfront + depositAmount`; client `expectedAmount` is checked, never trusted (`AmountNotAuthoritativeError` 422); re-derived INSIDE the posting tx | `deals.ts:285-378` (`fundEscrow`, `applyEscrowFunding`), route `deals/[id]/[action]/route.ts:31-39` | tenant (party), admin | `fund_escrow`: debit psp_clearing, credit escrow_liability — liability up, NO revenue |
| 5 | confirm-move-in: unlocks commission; explicit "releases their protection" copy | `deals.ts:381-390` | tenant (party), admin | none |
| 6 | earn-commission: pure function over the deal's OWN snapshots (`computeCommission`, `domain.ts:187-204`), truncating integer division | `deals.ts:396-420` | **admin only** | `recognise_commission`: debit escrow_liability, credit commission_revenue |
| 7 | settle: amount = outstanding liability read INSIDE the tx, never caller-supplied; PSP release instruction parks `pending` in live mode | `deals.ts:427-484` (`settle`, `applySettlement`) | **admin only** | `settle` + `release_to_landlord` |
| 8 | refund: everything still held → tenant; **no commission**; from escrow_funded or dispute_hold | `deals.ts:502-552` (`refund`, `applyRefundCompletion`) | **admin only** | `refund`: debit escrow_liability, credit psp_clearing |
| 9 | cancel: pre-funding only (Amendment A1 — funded deals cannot cancel); reason required | `deals.ts:555-564`, `domain.ts:126` | lister (party), admin | none |
| 10 | dispute-hold / resolve: hold blocks settlement; resolve restores the PRIOR status from transition history, not from the caller | `deals.ts:567-606` | admin | none |
| 11 | webhook `transaction.successful/failed/processing/cancelled` → money guard (currency==UGX AND amount==instruction.amount, else NOT booked + audit) → instruction transition → deal effect | `deals.ts:999-1121` (`applyPspWebhookOutcome`), `src/app/api/v1/payments/nylonpay/webhook/route.ts` | signature only (HMAC over raw body) | see §3 |

**Ledger mechanics** (`src/server/ledger.ts`): the ONLY writer is `post()`
(validates ≥2 legs, every amount > 0, Σdebits == Σcredits **before** any write, `ledger.ts:85-96`);
entries are never updated or deleted — corrections are new reversing postings (`reversePosting`,
`ledger.ts:126-144`); per-deal accounts are lazily created inside the caller's transaction so a
rollback cannot orphan them (`accountFor`, `ledger.ts:202-209`).

**Atomicity:** every money-bearing transition runs status change + immutable `deal_transition`
row + ledger posting + audit event inside ONE interactive transaction
(`applyTransition` + callers, `deals.ts:40-44, 929-988`; 30s budget). PSP network calls are issued
BEFORE the transaction opens (preflight pattern, `deals.ts:292-311`) — no network call holds DB locks.

---

## 2. Threat model (STRIDE, per actor)

| Actor | Entry points | Assets at risk | Primary defenses (verified) |
|-------|--------------|----------------|------------------------------|
| Anonymous attacker | every API route; webhook route | money figures, existence of deals | `requireSession` 401; webhook auth = HMAC-SHA over raw bytes + 5-min freshness (`nylonpay.ts:104-114`); unconfigured secret → **503 fail-closed** (`webhook/route.ts:57-62`); invalid/missing sig → 401; non-parties get **404 not 403** (no existence leak, `deals.ts:833-836`) |
| Authenticated tenant | deal actions | funding others' deals, posting fake amounts | role matrix `tenant` on fund/confirm only + party scope re-checked at the route (`[action]/route.ts:74-84`); amount derived server-side (`AmountNotAuthoritativeError`); `expectedAmount` optional-and-checked |
| Landlord (lister) | deal actions, agreements | signing someone else's agreement, settling themselves | sign/cancel are party-scoped lister actions; settle/earn/refund are **admin-only**; agreement lookup scoped to THIS deal's listing (F-014, `deals.ts:244-255`) |
| Field officer | deal creation | creating deals off others' introductions | `NotTheIntroducingOfficerError` (`deals.ts:173-175`); viewing must be `conducted`; one active deal per introduction |
| Rogue/compromised admin | every admin action | everything (admin is God by design) | every money event audited with actor + amounts as strings in the SAME tx (`deals.ts:967-985`); reconciliation check (`runReconciliation`, `ops.ts:259-291`); dual-key rails on any production migration |
| PSP (Nylon Pay) | webhook | double-booking, replay, amount manipulation | at-least-once contract handled by DB-level dedup: `@@unique([instructionId, toState])` (schema.prisma:930) + terminal-state refusal (`ledger.ts:513-520`); money guard books only exact-amount UGX confirmations; mismatches land in `psp_amount_mismatch` audit rows, never auto-posted (`deals.ts:1054-1075`) |
| Man-in-the-middle | capture & replay webhook | re-trigger money events | 5-minute freshness window (provider re-signs genuine retries; captured replays fail) + idempotent handlers |

**Residual trust assumptions:** the signing secret's confidentiality; the admin role's integrity;
the provider sending well-formed references. These are external to the code.

---

## 3. Invariant verification (each with its evidence)

| Invariant | Verdict | Evidence |
|-----------|---------|----------|
| I-1 Every posted figure is server-derived | **VERIFIED** | `fundEscrow` derives from the deal's own snapshot + listing (`deals.ts:300-305`); `applyEscrowFunding` re-derives INSIDE the tx (`deals.ts:356-363`); settle/refund post the in-tx liability balance (`deals.ts:472-477, 541-545`); commission = pure snapshot function. The only client amount field (`expectedAmount`) is checked-never-trusted and parsed through `parseShillings` (integer-only, `http.ts:133-142`). |
| I-2 Ledger always balances | **VERIFIED (code) / structural trigger ABSENT (DB)** | `validatePosting` refuses unbalanced legs pre-write; `everyPostingBalances()` re-checks globally in reconciliation. **However** the BEFORE UPDATE/DELETE trigger the code comments mention (`ledger.ts:14-15`, schema comment :843-846) does **not exist** in the repo's migrations (only `20261027120000_media_variants` exists; the historical folder was lost). Immutability is enforced by the service layer being the sole writer. Finding F-6. |
| I-3 Status + money + history + audit commit atomically | **VERIFIED** | one `$transaction` per transition; audit write on the single shared path (`AUDITED_STATUSES`, `deals.ts:146-151, 967-985`). |
| I-4 No double release / refund over credit | **VERIFIED** | liability read INSIDE the posting tx (`outstandingEscrowLiability(deal.id, tx)`); terminal transition check refuses a second settle/refund (409 `ILLEGAL_TRANSITION`); refund amount = exact outstanding balance → escrow discharges to zero (`financialSummary.escrowDischarged`, `deals.ts:676`). |
| I-5 Snapshots immutable | **VERIFIED** | re-sign blocked (`SnapshotImmutableError`); no code path writes snapshot columns outside `signAgreement`; no public route mutates Deal directly. |
| I-6 Webhook replay safety | **VERIFIED** | `transaction.successful` replay → money guard passes → `transitionPspInstruction` silent-acks (same state) → deal-status guard returns `already_applied`. DB unique `(instructionId,toState)` is the hard backstop. |
| I-7 Instruction idempotency | **VERIFIED** | `idempotencyKey @unique` (schema:903) with per-deal keys `fund:/settle:/refund:{dealId}`; live mode reuses the in-flight/succeeded instruction per (deal, kind) (`ledger.ts:387-391`). |
| I-8 Live mode never half-configured | **VERIFIED** | `nylonPayMode()` requires ALL THREE credentials else sandbox-mock fallback with a loud warning (`nylonpay.ts:32-43`); failure direction is towards honesty. |
| I-9 Custody booked only on confirmed money | **VERIFIED with F-1/F-3 caveats** | mock settles instantly but labels itself MOCK in the DB; live books only after verified webhook + money guard. Caveats: F-1 (terminal-state bypass at application layer), F-3 (booking failure invisibility). |
| I-10 Reconciliation exists and reports honestly | **VERIFIED (partial scope)** | `runReconciliation` (admin-gated POST/GET `/api/v1/ops/reconciliation`): postings balance + PSP-succeeded-collects == ledger fund_escrow credits; result persisted to `reconciliation_check`. Scope honestly noted in code: covers collects only — release/refund reconciliation is future work once payout dispatch exists. |

---

## 4. Findings register

Severity scale: **Critical** (money loss/corruption reachable in the current mode) · **High**
(money loss/corruption reachable once live, or invariant bypass) · **Medium** (invariant enforced
by discipline only, or observability gap on a money path) · **Low** (hardening) · **Informational**
(semantic/policy notes).

### F-1 · MEDIUM — Webhook books money effects without confirming the instruction transition was accepted
`applyPspWebhookOutcome` (`deals.ts:1077-1115`) calls `transitionPspInstruction(..., 'succeeded')`
but **ignores whether the transition was accepted**. The ledger refuses a state change on an
already-terminal instruction and logs an anomaly (`ledger.ts:513-520`) — yet the caller proceeds
unconditionally to the deal-status check and can still book escrow funding. Scenario: provider
sends `transaction.failed`, then a contradicting late `transaction.successful` (real PSPs do
timeout-then-confirm). The instruction stays `failed`, the booking still happens → the documented
guarantee "an already-terminal instruction NEVER changes state; booked custody is only ever undone
through the refund action" (`ledger.ts:477-486`) is bypassed at the application layer. The ledger
stays internally balanced and the money guard still applies, so exposure is bounded — but
instruction-state and booked custody diverge, which is exactly what the state machine was built to
prevent. **Fix (applied this round, semantics-preserving):** verify `derivedPspState` of the
returned instruction is `succeeded` before applying any deal effect; on refusal, record a
`psp_terminal_refused` audit row and return `instruction_terminal_refused` without booking.

### F-2 · MEDIUM — "One active deal per introduction" is enforced by query only (check-then-insert race)
`createFromIntroduction` (`deals.ts:183-189`) does `findFirst(active)` then `create` inside an
interactive transaction. On Postgres (production) at READ COMMITTED, two concurrent calls can both
observe "no active deal" and both insert — there is **no unique constraint** on
`Deal.introductionRecordId` (schema:752), and a plain unique would be wrong by design (a
terminated deal must not bar a retry, `deals.ts:180-182`). Likelihood is low (officer-driven
flow), impact is a duplicated escrow flow on one introduction. **Proposed fix (needs owner
decision — production DDL):** partial unique index
`CREATE UNIQUE INDEX deal_one_active_per_introduction ON deal (introduction_record_id)
WHERE status NOT IN ('closed','cancelled','refunded') AND introduction_record_id IS NOT NULL;`
via `scripts/apply-migration.mjs` rails. Draft left at
`prisma/migrations/20261028120000_deal_active_per_introduction/migration.sql`; **not applied anywhere**.

### F-3 · MEDIUM — A confirmed collection whose booking fails becomes invisible to ops (live mode)
Live flow: webhook confirms money → instruction `succeeded` → `applyEscrowFunding`. If the booking
throws after the transition (e.g. `ListingTermsChangedError` — the tripwire working as designed),
the webhook route returns 500, the provider retries, the transition no-ops, the booking throws
again, retries exhaust — and the only trace is a server log line. Money collected per the
provider, custody never booked, no DB-visible anomaly (the `psp_amount_mismatch` audit covers a
different failure). **Fix (applied this round, additive observability):** the webhook path wraps
each deal-effect application; on failure it writes a `psp_booking_failed` audit row (actor = the
labelled system party, subjectRef = instruction id, payload = error class + message) and rethrows
so the provider still retries. Ops now has a queryable record; the retry loop is unchanged and
correct.

### F-4 · LOW — `systemPartyId()` get-or-create race can mint duplicate sentinel parties
`deals.ts:910-921` does findFirst-by-displayName then create, with no unique constraint that maps
to the sentinel. Two simultaneous webhook deliveries could both create
`House For Rent System (PSP webhook)`. Benign (it is a label, referenced by FK either way) but it
degrades the "one stable, clearly-labelled system party" intent. Proposed: cache in-process and/or
upsert on the non-dialable sentinel phone with a unique index — deferred as cosmetic.

### F-5 · LOW — Live instruction reuse ignores amount drift
`issueLiveInstruction` (`ledger.ts:387-391`) reuses the in-flight instruction for (deal, kind)
without comparing its amount to the freshly derived figure. If listing terms change between issue
and retry, the reused instruction carries the old amount while the eventual booking re-derives the
new one; the money guard would confirm the OLD amount against the provider while the tripwire
(`ListingTermsChangedError`) already blocks the rent case — residual exposure is limited to
`requiredMonthsUpfront`/`depositAmount` edits inside a narrow window. Proposed: on reuse, compare
amounts and mark the stale instruction `failed` before issuing a fresh one. Deferred (window is
milliseconds; rent — the dominant term — is already guarded).

### F-6 · LOW — Ledger immutability is a code convention, not a DB constraint
No trigger enforces "no UPDATE/DELETE on ledger_entry" in any migration in the repo; the comments
(`ledger.ts:14-15`, schema:843-846) describe one that the lost historical migration folder may
have contained — production state unverified this round (read-only trigger probe suggested as a
follow-up). Every access path in this codebase goes through `post()`/`reversePosting()` only.
Proposed: `CREATE OR REPLACE FUNCTION ledger_entry_immutable() ... EXECUTE PROCEDURE` trigger
migration via the same rails as F-2. Pending owner decision.

### F-7 · INFORMATIONAL — `settled` is reachable from `dispute_hold` without commission ever being earned
The state machine permits `dispute_hold → settled` (`domain.ts:130`) and `applySettlement`
correctly pays out the full outstanding balance — which, if the hold was entered from
`escrow_funded`, includes the commission share, and `commission_earned` can never subsequently run
(no path back). That is a legitimate policy lever (staff resolving a dispute administratively) but
it permanently forfeits platform commission. No defect; recorded so the business knows the lever
exists and that its use is audited via the transition trail.

### F-8 · INFORMATIONAL — Reconciliation scope is collects-only
`runReconciliation` compares PSP-succeeded **collect** instructions against `fund_escrow` credits.
Release/refund legs are not reconciled against provider-side payouts because payout dispatch is
not wired (live instructions park `pending` honestly). This is the correct scope TODAY and must be
extended when payouts go live (standing reminder tied to blocker #1).

### F-9 · INFORMATIONAL — Escrow semantics (restated from §0)
Internal ledger + state machine + mock PSP seam. NOT legal escrow. Marketing copy constraints
enforced by review; control center states the provider status on-surface.

---

## 5. Positive verifications (what was checked and is RIGHT)

- **No client-controllable money path found.** Grepped every route accepting amounts
  (`parseShillings` surfaces): deal `expectedAmount` (checked), landlord property/listing-terms
  input (legitimate listing terms that the snapshot+tripwire system then guards). Nothing posts a
  caller-supplied figure to the ledger.
- **Authorization matrix is single-source.** `DEAL_ACTIONS` roles are the same table the UI renders
  and the route re-checks per request (`[action]/route.ts:70-84`) — UI/ enforcement cannot drift.
- **404-not-403 for non-parties** on deal reads/actions (no resource-existence oracle).
- **Landlord financials are ledger-derived per deal, then summed** — flows and liabilities never
  summed blindly (`deals.ts:693-739`); totals match what the console reads.
- **Webhook contract is provider-grade:** fail-closed 503, 401 on bad signature, ack-unknowns,
  500 only for our own transient failures (provider retry), no session by design.
- **BigInt everywhere, strings over the wire** — no float in any money path; JSON serialization of
  raw deal rows is avoided (routes project `{id, status}` only, `deals.ts` returns `.toString()`).
- **Mock mode is self-labelling and self-healing:** a succeeded mock instruction is reused on
  retry, so an interrupted funding path recovers on the next attempt.

## 6. Verification status of this round's fixes

- ESLint 0 errors, `tsc --noEmit` clean after F-1/F-3 edits.
- E2E webhook rehearsal **UNVERIFIED** (requires live Nylon Pay credentials + signed deliveries —
  external blocker #1). The changed code paths are exercised by reasoning over all three
  `transitionPspInstruction` outcomes (accept / silent-ack / terminal-refuse) documented in F-1;
  the added audit rows use the same write pattern as the existing `psp_amount_mismatch` path.
- F-2/F-6 migration drafts are committed as FILES ONLY, deliberately unapplied; `apply-migration.mjs`
  rails (two-key + name-ledger) make accidental application impossible without an explicit owner act.

---

## Addendum — financial architecture foundation (2026-10-30)

The task "Financial Architecture Foundation" extended this system per the approved business
policies; the design record is `docs/FINANCIAL_ARCHITECTURE.md`. What changed at the audit level:

- **Commission earning moved** from the post-move-in admin action to **confirmed payment**
  (`applyEscrowFunding` recognises it inside the same transaction as custody, from the deal's own
  snapshots). `commission_earned` remains a valid status for legacy deals; the legacy earn action is
  still reachable from `move_in_confirmed` and refuses a second recognition
  (`CommissionAlreadyRecognisedError`).
- **Snapshot completeness (closes F-5's window):** advance months, total advance rent, deposit,
  commission payer, the >3-months mutual-agreement reference and policy tokens are now frozen onto
  the deal at signing; funding derives EVERY figure from the deal's own columns. The rent tripwire
  (`ListingTermsChangedError`) became a soft, audited `listing_terms_drift` flag - funding no longer
  depends on the listing, so a hard stop would be a false-positive risk.
- **Rent/deposit split:** new classifications `rent_escrow_liability` / `deposit_liability`
  (`fundEscrowSplit`). Settlement pays the RENT side only; the deposit discharges through its own
  lifecycle. Legacy deals keep the single `escrow_liability` shape and the pre-extension semantics.
- **New lifecycles:** move-in verification (evidence-based, silence never auto-confirms and never
  blocks forever - the decision is admin-recorded with reasons), deposit deductions
  (propose → HFR review → tenant accept/dispute → apply), refunds with kinds + pending/failed
  records, provider payment reversal (exact reversing postings; terminal `reversed` pre-settlement,
  `financial_review_required` post-settlement), provider fees as `psp_fee_expense`, financial
  adjustments, and post-settlement landlord refund coordination (explicitly NOT a platform
  liability - no guarantee balance).
- **Reconciliation extended:** inflow (prefix-matched), classification consistency, and payout
  honesty (release/refund instructions 1:1 against ledger payout credits; clawback legs excluded on
  both sides). Deduction payouts now carry their own release instruction so the 1:1 holds.
- **Mock PSP carries a synthetic providerRef**, so signature-verified webhook deliveries can be
  rehearsed against the sandbox (duplicate-confirmation + terminal-refusal + amount-guard paths are
  now EXECUTED in `scripts/finance-pipeline-tests.mjs`, not merely reasoned about).
- **Pool-deadlock fix learned en route:** the PSP seam must never be awaited inside an interactive
  transaction under a size-1 pool (P2028); `reverseCommission` follows the established preflight
  pattern (instruction issued before the tx opens).
- **Audit actors:** lifecycle audit rows use the labelled system party (`House For Rent System
  (PSP webhook)`), never a fabricated `'system'` id (FK integrity).

Verification: `scripts/finance-pipeline-tests.mjs` — 89/89 checks executed against the isolated rig
(real HTTP surface, real schema DDL, mock PSP): advance-rent math, 10%-of-one-month commission,
deposit exclusion, fee expense, >3-months mutual agreement (refused/accepted), snapshot immunity
after listing edits, duplicate-payment safety (re-funding, duplicate webhook, amount mismatch,
unknown reference), pre-verification settlement refusal, both-confirm + dispute + verify/reject
paths, settlement = rent − commission, deposit separation + partial deduction + release + case
closure, pre-settlement refund (+ commission retention default + approved-category reversal +
POLICY_PENDING refusal), partial refunds, post-settlement coordination with NO platform balance,
provider reversal to terminal `reversed`, role refusals (tenant/landlord cannot settle/refund/earn),
reconciliation isReconciled=true, transition history + audit rows, and the public/admin/ops surfaces
still serving. Regression: KYC 80/80, image pipeline ALL PASS. Migration committed as a FILE ONLY
(`prisma/migrations/20261030120000_financial_architecture_foundation`) — additive, unapplied,
owner-gated via `scripts/apply-migration.mjs` rails.
