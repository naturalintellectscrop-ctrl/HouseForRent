# House For Rent — Product Overview

**Organization:** Natural Intellects Limited
**Product:** House For Rent (HFR) — a digitally managed rental marketplace for Uganda
**Deployed (preview/live URL):** `https://houseforrentug.vercel.app` (intended custom domain: `houseforrent.ug`, not yet connected — `docs/NYLONPAY_GOLIVE.md`, `docs/FEATURE_VERIFICATION_MATRIX.md` blocker #3)
**Status of this document:** Written 2026-11-11 from a read-only repository audit at commit `ad93c96`. Every claim is labeled: **[Verified in source code]**, **[Verified in production]** (via the 2026-11-11 read-only preflight artifact or a live HTTP check performed during this audit), **[Reported by previous agent]** (commit/worklog records), or **[Inferred or unverified]**.

Companion documents: `docs/ARCHITECTURE.md` (technical), `docs/DEVELOPER_ONBOARDING.md` (how to work on it), `docs/RELEASE_READINESS.md` (what is ready and what blocks launch), `docs/REPOSITORY_HYGIENE_AUDIT.md` (repo cleanliness). Existing documents this one reconciles with rather than replaces: `docs/VALUE_PROPOSITION_MATRIX.md` (copy rules), `docs/ROLE_PERMISSION_MATRIX.md`, `docs/FINANCIAL_ARCHITECTURE.md`, `docs/FEATURE_VERIFICATION_MATRIX.md`.

---

## 1. The problem HFR is designed to solve

HFR is a managed rental marketplace: it coordinates the rental process beyond property discovery — property verification, viewing coordination, agreements, transaction records and move-in — instead of stopping at a listing feed.

The problem is addressed through concrete product mechanisms rather than asserted market research (no market-size, customer-count or performance claims appear in this document, by policy `docs/VALUE_PROPOSITION_MATRIX.md`):

- **Trust deficit on listings.** Ordinary listing sites publish whatever a poster uploads. HFR sends its own Field Operations Officer (FOO) to every property before it can go live; the officer files a structured field report and takes the listing photos, which carry provenance labels (`field_officer` / `lister` / `development_fixture`) in the database and UI. **[Verified in source code]** — `src/server/viewings.ts` (officer verification verdict), `src/server/media.ts` (photo provenance), `src/app/(site)/properties/[id]/page.tsx` ("What our officer found" block), `docs/IMAGE_PIPELINE_REPORT.md`.
- **Viewing coordination.** Tenants cannot self-serve keys or visits: viewings are requested in-product, dispatched to an officer by an administrator, conducted with a structured report, and closed with immutable evidence. **[Verified in source code]** — `src/server/viewing-state-machine.ts`, `src/app/ops/dispatch/page.tsx`.
- **Circumvention (bypassing the platform after introduction).** When the tenant and landlord meet through the platform and then transact off-platform, the platform loses the deal it created. HFR writes an **immutable `IntroductionRecord`** for every conducted viewing — "queryable circumvention evidence" — and commissions are only earned on rent actually collected through HFR. **[Verified in source code]** — `src/server/viewings.ts` (conduct writes the record), `src/app/ops/introductions/page.tsx`, `prisma/schema.prisma` (`introduction_record`, append-only).
- **Unrecorded money.** Advance rent and deposits in this market are typically cash events with no receipts. HFR records every financial event in a double-entry ledger with snapshot-frozen deal terms. **[Verified in source code]** — `src/server/ledger.ts`, `src/server/deals.ts`; note that **no real money has moved yet** (all money tables 0 rows in production, 2026-11-11 preflight — see §8).
- **Move-in and deposit disputes.** Handover is verified (tenant and landlord confirm independently, disputes enter an admin review) and deposits live in their own ledger custody with a propose → review → accept/dispute → apply → release lifecycle. **[Verified in source code]** — `src/server/finance/move-in.ts`, `src/server/finance/deposit.ts`.

## 2. Target market and intended users

**[Verified in source code]** unless noted:

- **Market:** Uganda. Evidence: currency is UGX integer shillings everywhere (`src/lib/money.ts` — "UGX has no subunit"), Ugandan national ID (NIN) format validation `^[A-Z0-9]{14}$` (`src/app/(portal)/account/identity/identity-form.tsx`), mobile-money payout destinations (`src/server/kyc.ts`), Uganda Data Protection and Privacy Act 2019 referenced in the identity and privacy copy (`src/app/(site)/privacy/page.tsx`).
- **City focus:** Kampala. The seed set and product copy are Kampala-specific; production holds 12 neighbourhood records (2026-11-11 preflight). Service areas are configurable (`in_service_area` flag gates publishing — `src/server/listings.ts` publish blockers).
- **Users (roles):** `AUTH_ROLES = ['tenant', 'lister', 'foo', 'admin']` (`src/server/domain.ts:22`). Landlords are "listers", in three tiers — `property_owner`, `broker_agent`, `property_mgmt_company` — where non-owners additionally need a verified property mandate to publish (`docs/ROLE_PERMISSION_MATRIX.md` §4, `src/server/ops.ts` `setListerTier`).

## 3. The tenant experience (implemented)

**[Verified in source code]**; routes cited:

1. **Register** (`/register`) — phone-or-email + password; tenants are `active` immediately, and are provisioned only as tenant/lister (staff are admin-provisioned). **[Verified in source code]** `src/app/api/v1/auth/register/route.ts`.
2. **Identity verification** (`/account/identity`) — required before requesting a viewing. Currently a **disclosed development mock** (NIN + name match), not a real KYC provider — `src/server/ops.ts` (`IDENTITY_PROVIDER_IS_MOCK = true`), and the UI states this on the page. **This is a launch blocker** (`docs/FEATURE_VERIFICATION_MATRIX.md` blocker #2).
3. **Discovery** (`/properties`, `/properties/[id]`) — GET-form search (no client JS), filters, chips, JSON-LD, officer field report and provenance-labeled photos on the detail page, save/bookmark (`/account/saved`).
4. **Viewing request** (`/account/viewings/new`) — date/time request on a live listing; unverified tenants are refused server-side (`TENANT_NOT_VERIFIED`).
5. **Viewing outcome** (`/account/viewings`) — officer conducts; tenant sees status and server-written "what happens next" copy; two-step cancellation while `requested/scheduled`.
6. **Deal** (`/account/deals/[dealId]`) — the tenancy workspace: progress trail, ledger-derived money panel, and actions rendered **only from the server's `availableActions`** (e.g. fund escrow, confirm move-in). Money-moving actions require an explicit checkbox naming the exact amount ("Pay the landlord UGX … This CANNOT be undone."). **[Verified in source code]** `src/app/(portal)/deal-view.tsx`, `deal-action.tsx`.
7. **Payment** — today through the **self-labeled NylonPay sandbox mock**; live collect is implemented in code but **not yet enabled end-to-end with the real provider** (see §8). **[Verified in source code]** `src/server/ledger.ts` (MOCK labels), `docs/NYLONPAY_GOLIVE.md`.
8. **Move-in verification** — tenant confirmation opens it; landlord confirms independently; disputes are admin-reviewed; a "not verified" decision keeps money held. **[Verified in source code]** `src/server/finance/move-in.ts`.
9. **Deposit lifecycle** — deductions proposed by the landlord are reviewed by HFR, accepted or disputed by the tenant, applied by an admin only, and the deposit is released against the ledger balance with a single-pending-release guard. **[Verified in source code]** `src/server/finance/deposit.ts`.

## 4. The landlord experience (implemented)

1. **Register → terms** (`/landlord/terms`) — versioned onboarding terms with explicit acceptance recorded (append-only `consent_record`).
2. **KYC** (`/landlord/verification`) — three independent sections (identity, authority-to-let, payout details) with document/selfie evidence, ownership particulars for owners, authority explanation for agents; admin-reviewed with reasons; payout details verify **format only** — real payouts are switched off until provider arrangements complete (disclosed in the form copy). **[Verified in source code]** `src/server/kyc.ts`.
3. **Property + listing creation** (`/landlord/properties/new`) — neighbourhood (in-service only), landmark-first location, terms (rent, deposit, months upfront, mutual-agreement ref for >3-month advances).
4. **Verification & publish gates** (`/landlord/listings/[listingId]`) — one server-side gate implementation with five blockers: `field_verification`, `outside_service_area`, `mandate`, `listing_agreement`, `photography`; dry-run publish shows the exact remaining blockers; physical amendments re-arm verification. **[Verified in source code]** `docs/ROLE_PERMISSION_MATRIX.md` §4, `src/server/listings.ts`.
5. **Deal management** (`/landlord/deals`) — same shared deal view; landlord signs the agreement (which freezes the full financial snapshot), receives settlement net of commission, participates in move-in verification and the deposit lifecycle.
6. **Earnings** (`/landlord/earnings`) — ledger-derived money position (with a known minor read-model gap on the "held" figure for split-custody deals — `docs/RELEASE_READINESS.md` P2-4).
7. **Payouts** — **not live**: release instructions park `pending` ("Awaiting payout dispatch") until the provider payout API integration at go-live. **[Verified in source code]** `src/server/ledger.ts` live instruction path; `src/app/api/v1/admin/finance/overview/route.ts` `payoutDispatchNote`.

## 5. The Field Operations Officer (FOO) role

**[Verified in source code]**; routes under `src/app/ops`:

- **Assignment & tasks** — admins dispatch requested viewings to officers (`/ops/dispatch`); officers work a personal board (`/ops/today`).
- **Verification & conduct** — the visit workspace (`/ops/viewings/[viewingId]`) enforces the invariant order: structured **field report → media capture → close visit → open deal**; closing without a field report is refused server-side (`FIELD_REPORT_REQUIRED`); "tenant did not show" is a disciplined, CAS-guarded, audited action (`markNoShow`).
- **Deal operations** — deals are created **only from conducted-viewing introduction records** by the introducing officer (or an admin); tenant/landlord identities are derived server-side, never client-supplied (`src/server/deals.ts` `createFromIntroduction`).
- **Evidence & audit** — every officer action writes audit events; introduction records are immutable; officer photo provenance is distinct from landlord photos.
- **Role boundaries** — officers see field-work surfaces only; admin-only consoles (deals book, finance, reconciliation, config, audit, dispatch, users) render an `AdminOnly` explanation and are refused again server-side (the P-1 hardening round). **[Verified by automated test — reported]** `scripts/authz-regression-tests.mjs` 67/67 (Round 66).

## 6. Administrator and operations roles

**[Verified in source code]** unless noted:

- **Approvals & identity** (`/platform/approvals`) — account activation queue with a recorded decision + reason; the mock identity check is the (disclosed) evidence path.
- **Landlord KYC review** (`/platform/kyc/[submissionId]`) — three independent section decisions with mandatory reasons; evidence readable through the authorized media route.
- **Mandates** (`/ops/mandates`) — authority-to-list verification for non-owner listers.
- **Dispatch & areas** (`/ops/dispatch`, `/ops/areas`) — officer assignment with live load counts; service-area toggles (audited).
- **Deal oversight** (`/ops/deals`) — distribution, full action catalogue, per-deal audit trail.
- **Financial operations** (`/ops/finance`) — ledger integrity banner, duplicate-payment resolution queue, refund records with retry discipline, parked/blocked payouts, provider statement imports with frozen per-line classifications.
- **Reconciliation** (`/ops/reconciliation`) — internal ledger-vs-PSP assertion runs (persisted, immutable history) plus the manual provider-statement reconciliation lane.
- **Audit** (`/ops/audit`) — subject-scoped audit lookups (admin-only, deliberately no firehose).
- **Config & commission** (`/ops/config`) — append-only, effective-dated parameter and commission-rate versions (create-only; no edit endpoint).
- **Staff administration** (`/platform/settings`) — provision officer/admin accounts with one-time credentials; suspend/restore with self-change and last-admin lockout guards.
- **Launch gate** (`/ops` hero + `/api/v1/admin/launch-gate`) — counts live + verified + in-service-area + fresh listings against a configured target before launch is declared. **[Reported by previous agent]** for the current gate value.

## 7. The complete rental transaction journey

**[Verified in source code]** — `src/server/domain.ts` (`DEAL_STATUSES`, `ALLOWED_TRANSITIONS`, `TERMINAL_STATUSES`), `src/server/deals.ts`:

```
viewing requested → scheduled → conducted (field report + media + immutable introduction record)
  → deal created (from the introduction; one ACTIVE deal per introduction)
  → tenant_matched → agreement_signed  ← FULL FINANCIAL SNAPSHOT FROZEN HERE
  → payment_pending (live PSP) → escrow_funded   (custody booked + commission recognised
                                                  + deposit case opened, one transaction)
  → move_in_awaiting_verification → move_in_confirmed   (admin-verified handover)
  → settlement_pending → settled   (landlord paid rent net of commission; deposit still held)
  → closed
```

Side paths: refunds (full/partial, ledger-bounded, `refund_pending → refunded / partially_refunded`); provider clawback → `reversed` (pre-settlement) or `financial_review_required` (post-settlement); cancellation only before funding; `dispute_hold` freezes and restores. **Terminal statuses: `closed`, `cancelled`, `refunded`, `reversed`** (`src/server/domain.ts:205-210` — verified verbatim this audit). Design invariant: a funded deal can only end in `move_in_confirmed` or `refunded` — client money is never stranded (Amendment A1, `domain.ts` header).

## 8. Implemented vs planned — the honest split

| Capability | Status | Evidence |
|---|---|---|
| Listing discovery, search, SEO, saved homes | **Implemented** | `src/app/(site)/**` [Verified in source code] |
| Officer field verification + provenance photos + image pipeline | **Implemented** | `src/server/viewings.ts`, `src/server/media.ts`, `docs/IMAGE_PIPELINE_REPORT.md` [Verified in source code; suite 38/38 reported] |
| Viewing dispatch & conduct, immutable introductions | **Implemented** | `src/server/viewings.ts` [Verified in source code] |
| Deal state machine, snapshot-frozen agreements, double-entry ledger, refund/reversal machinery | **Implemented** (code) | `src/server/domain.ts`, `deals.ts`, `ledger.ts`, `finance/*` [Verified in source code] |
| Auth, sessions, RBAC, rate limiting, audit trail | **Implemented** | `src/server/auth.ts`, `http.ts`, `rate-limit.ts` [Verified in source code] |
| Tenant identity verification | **MOCK (disclosed)** — real provider not integrated | `src/server/ops.ts` `IDENTITY_PROVIDER_IS_MOCK` |
| PSP collect (money in) | **Code-complete, sandbox-mocked; live webhook signature gate verified; full live E2E with NylonPay not yet executed** | `src/server/nylonpay.ts`, `docs/NYLONPAY_GOLIVE.md` [Verified in source code; live-mode gate verified in production per worklog Round 57+] |
| PSP payouts (money out) | **NOT implemented against the provider** — instructions park `pending` | `src/server/ledger.ts` live release path [Verified in source code] |
| Deposit custody of real funds | **Gated off** (`deposit_custody_provider_confirmed = false`; live funding incl. deposit refused) | `src/server/deals.ts` `DepositCustodyUnconfirmedError`, `src/server/finance/policy.ts` |
| Reconciliation | Internal engine **implemented**; provider side is **manual JSON statement import** (no provider API) | `src/server/ops.ts` `runReconciliation`, `src/server/finance/provider-statement.ts` |
| Password reset / email notifications | **NOT implemented** (no email channel) | `docs/FEATURE_VERIFICATION_MATRIX.md` §2.4 |
| Renewal/recurring rent | **NOT implemented** (and by policy generates no commission) | `docs/FINANCIAL_ARCHITECTURE.md` §"one-commission" |
| Real-money production traffic | **Zero** — all money tables 0 rows (2026-11-11 preflight) | [Verified in production] `backups/prod-preflight-20261111T053456.json` |

## 9. How HFR differs from ordinary property-listing websites

| Capability | Ordinary listing site | HFR (evidence) |
|---|---|---|
| Listing integrity | Self-reported photos/details | Officer-verified field report + provenance-labeled photos [Verified in source code] |
| Viewings | Tenant/landlord self-arrange | Staff-conducted, dispatched, reported, evidence-locked [Verified in source code] |
| Introduction evidence | None | Immutable `introduction_record` per conducted viewing [Verified in source code] |
| Transaction record | None | Double-entry ledger, snapshot-frozen terms, append-only audit [Verified in source code] |
| Move-in & deposits | Handshake | Verified handover + deposit case lifecycle with dispute path [Verified in source code] |
| Business model | Listing fees/ads | Success commission on initial rent collected through HFR only |

**Defensible differentiation today:** the officer-verification + introduction-evidence loop and the disciplined financial core (state machine + ledger + audit). **Still aspirational:** end-to-end digital money movement (payouts, live custody) and person-verification — both explicitly parked and disclosed rather than faked.

## 10. Revenue model

Approved business rules (owner-approved; preserved verbatim in intent):

- **Commission is 10% of (one month's) rent, paid by the landlord** — applies once to eligible initial rent collected through HFR; deposits are excluded; earned only after provider-confirmed successful payment; renewals generate no commission; PSP processing costs are HFR operating expenses (never deducted from the tenant's deposit or the landlord's agreed net); prepaid rent/refunds follow the agreed, legally-reviewed arrangements.

Implementation mapping (full table in `docs/RELEASE_READINESS.md` §5): `src/server/domain.ts` `computeCommission` (integer basis-points of one month's rent), rate from the append-only `CommissionRateVersion` table (config-driven via `/ops/config`), payer frozen at signing, commission posted inside the single custody-booking transaction, deposits in a separate `deposit_liability` account, `psp_fee_expense` for provider fees, no renewal path exists.

> **⚠ Material discrepancy (P0 decision, see RELEASE_READINESS):** the code's bootstrap default is **10000 bp = one full month's rent** (`src/server/listings.ts:457-459` — verified this audit), and the public `/for-landlords` page renders it as "one month's rent", while the approved policy wording says **10%**. The engine is rate-config-driven, so this is an owner configuration/policy decision — but it must be resolved **before the first real deal is signed**, because signed deals snapshot the rate in force. Production currently holds exactly 1 commission-rate version row (2026-11-11 preflight). **[Verified in source code]** + **[Verified in production]** (row count).

Other revenue streams (subscriptions, listing fees, ads): none implemented.

## 11. Operational responsibilities HFR assumes

**[Verified in source code]** — these are staff-operated workflows, not self-serve automation: field verification visits and photo capture; viewing dispatch and scheduling; landlord KYC review (three sections, reasons on file); mandate verification; account approvals; deal oversight and dispute review (move-in disputes, deduction disputes, dispute holds); duplicate-payment resolution; refund execution and retry; provider statement import and reconciliation runs; commission-rate and parameter versioning; staff provisioning and suspension; audit retention (append-only `audit_event`).

## 12. Business-model dependencies and risks

**[Verified in source code / Verified in production / Reported by previous agent]**

1. **PSP (NylonPay):** live mode requires merchant KYC and all three credentials; **Level-1 accounts are capped at 10M UGX/month** — a planning constraint documented in `docs/NYLONPAY_GOLIVE.md`. Payout dispatch is not yet integrated at all.
2. **Legal:** 12 open legal questions (`docs/LEGAL_QUESTIONS_REVIEW.md`) — privacy (Uganda DP&A Act 2019) and terms questions, several marked **hard blocks for real money**; both `/terms` and `/privacy` are engineering-drafted and unreviewed by counsel.
3. **Identity provider:** person-verification is a disclosed mock; a real provider is a launch blocker for trust claims.
4. **Domain/DNS:** `houseforrent.ug` not yet connected; the vercel.app URL works meanwhile.
5. **Custody/legal structure of held funds:** deposit custody flag is off pending "provider custody/release verification" and legal approval (`src/server/finance/policy.ts` `PENDING_POLICY_APPROVALS` — 7 outstanding policy decisions registered in-product).
6. **Operational capacity:** every letting consumes officer field time (visit + photos + report + dispatch); the launch gate intentionally requires a verified live inventory before public launch.
7. **Platform risks:** no CI, single ephemeral development sandbox, Supabase Free plan (no automated backups/PITR — mitigated by the scripted export loop, `docs/DISASTER_RECOVERY.md`; the first verified export exists but its **off-host copy is still pending owner action**), and key-person continuity knowledge concentrated in `worklog.md`.
8. **Credentials hygiene:** two production credentials transited chat in the Round-69 session (recorded in `worklog.md` Round 69); **rotation is recommended**. Values never appear in the repository. **[Reported by previous agent]**

## 13. Working value proposition (evaluated)

Working proposition: *"HFR provides a digitally managed rental marketplace that coordinates the rental process beyond property discovery, including property verification, viewing coordination, agreements, transaction records and move-in processes."*

| Element | System support | Verdict |
|---|---|---|
| Property discovery | Full public marketplace, search, SEO | **Supported — implemented** |
| Property verification | Officer field reports, provenance photos, publish gates | **Supported — implemented** (verification of *persons* is mock) |
| Viewing coordination | Request → dispatch → conduct → evidence | **Supported — implemented** |
| Agreements | Versioned terms + acceptance + snapshot-frozen deal agreement | **Supported — implemented** (legal text unreviewed by counsel) |
| Transaction records | Double-entry ledger, PSP boundary, audit | **Supported — implemented** (no real money has moved yet) |
| Move-in processes | Evidence-based verification + deposit lifecycle | **Supported — implemented** (deadlines pending policy approval) |

Conclusion: the proposition is **substantially supported by the existing system**, with the two honest exceptions being live money movement (collect code-complete but not provider-proven; payout not built) and person identity verification (mock). The defensible differentiation is the verification-and-evidence loop, which ordinary listing sites do not have and which is already real.
