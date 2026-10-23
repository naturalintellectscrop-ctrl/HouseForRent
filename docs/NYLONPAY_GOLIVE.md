# NylonPay go-live runbook — House For Rent

**Owner:** Natural Intellects Ltd · **Prepared:** October 2026 (production gate, Task 43)

Sources: official merchant docs (docs.nylonpay.nilesquad.com/docs/guides/merchant-onboarding), the bundled SDK (`@nile-squad/nylonpay-ts` README/spec), and this repository's integration code. No credential or approval status is claimed here — those are owner actions.

---

## 1. What the code already guarantees (verified by audit)

| Control | Where | Status |
|---|---|---|
| Live mode is impossible without ALL THREE credentials (`NYLONPAY_API_KEY`, `NYLONPAY_API_SECRET`, `NYLONPAY_WEBHOOK_SECRET`) | `src/server/nylonpay.ts` `nylonPayMode()` | ✅ Fail-safe: half-configured = sandbox mock, loudly warned |
| Custody/settlement/refund booked ONLY on a signature-verified webhook — never because a browser reported success | `deals.applyPspWebhookOutcome` + webhook route | ✅ The sync action returns the untouched deal when the instruction is `pending` |
| Webhook signature verified against the RAW body; unsigned = 401; unconfigured secret = 503 (provider retries) | `src/app/api/v1/payments/nylonpay/webhook/route.ts` | ✅ Verified live on production: unsigned → 401, bogus sig → 401 INVALID_SIGNATURE |
| Duplicate delivery | `ledger.transitionPspInstruction` — current state == target = silent ack | ✅ Idempotent by construction |
| Out-of-order / late contradicting delivery | Terminal-state lock: first terminal outcome stands, late deliveries refused + logged as anomaly | ✅ |
| Amount/currency mismatch | NOT booked; instruction stays pending; `psp_amount_mismatch` audit row for ops reconciliation | ✅ |
| Financial posting atomicity | `applyEscrowFunding`/`applySettlement`/`applyRefundCompletion` run inside one DB transaction; the posted amount is RE-DERIVED from the deal's snapshotted terms inside the transaction (`AmountNotAuthoritativeError` on any mismatch) | ✅ |
| Mock honesty | Sandbox mock labels every instruction MOCK in the database itself | ✅ |
| Reconciliation surface | `/ops/reconciliation` + `/api/v1/ops/reconciliation` (staff) | ✅ present |

## 2. What the owner must do (merchant actions — nothing here can be done in code)

### Step 1 — sandbox now (no KYC needed, free)
1. Sign up at nylonpay.com (email verify) → sandbox immediately.
2. Dashboard → Accounts → **Create Account** (collection account, e.g. "House For Rent").
3. Settings → API Keys → **Create Key** → copy `npk_test_…` / `nps_test_…` (secret shown once).
4. API Settings → Webhook Configuration → set the webhook URL on the key:
   `https://houseforrent.ug/api/v1/payments/nylonpay/webhook` (use the production domain once live; the vercel.app URL works until then).
5. Hand the two sandbox keys to engineering (secret channel) → set as Vercel env vars; leave `NYLONPAY_MODE` unset or `sandbox`.

### Step 2 — Level 1 KYC (free, ~1–2 business days)
Submit from Settings → Verification (or the Go Live banner). Exactly what is asked:

| Field | Notes for Natural Intellects |
|---|---|
| Product/service name | "House For Rent" |
| What you sell | Residential rental marketplace services (verified property listings, mediated viewings, deposit escrow) |
| Use case | How the platform uses Nylon Pay: collecting tenant deposits into escrow, releasing settlements to landlords, platform commission |
| Business description | Brief overview — marketplace operated by Natural Intellects Ltd, Kampala |
| National ID | Verified via a hosted ID capture session (the registrant completes it in the browser) |
| Phone number | Registered in the registrant's own name |

Outcome: approved → account upgraded to **live mode** with a **10M UGX monthly limit**.

> ⚠️ **Business planning flag:** a single rent deal (e.g. 800k × 4 months upfront + deposit ≈ 4–5M UGX) can consume half the Level-1 monthly limit. Ask NylonPay about higher-tier verification BEFORE launch week if more than ~2 deals/month are expected; otherwise real deals will be declined mid-month.

### Step 3 — after approval
1. Settings → API Keys → create **live** keys (`npk_live_…` / `nps_live_…`).
2. Accounts → **Settlement**: add the settlement phone/bank account (defaults to the KYC phone).
3. Give engineering the live keys via the secret channel → Vercel env vars (`NYLONPAY_API_KEY`, `NYLONPAY_API_SECRET`, `NYLONPAY_WEBHOOK_SECRET`, `NYLONPAY_MODE=live` — all four together, or none: the code refuses half-live).
4. Rotate the webhook secret on the key if it was shared during sandbox.

## 3. The controlled go-live test (gate before real customers pay)

Executed in order, each step recorded in the worklog; any failure stops the ladder:

1. **Sandbox E2E (needs DB resumed):** create test accounts → deal → fund → confirm webhook transitions instruction → escrow ledger posted → settle/refund paths → `/ops/reconciliation` shows clean. Repeat deliberately with: duplicate delivery (same `delivery_id`), delayed redelivery, invalid signature (expect 401 + no state change), out-of-order `transaction.failed` after `successful` (expect refusal + anomaly log), amount mismatch (expect NOT booked + audit row).
2. **Production sandbox-keys smoke:** with sandbox keys on production Vercel env, one real browser deal flow end-to-end on production (MOCK-labeled rows prove sandbox).
3. **First real transaction (owner-approved):** one small real deal between two consenting team accounts in LIVE mode; verify money moved on the NylonPay dashboard AND the ledger AND the settlement path; then refund path.
4. Only after step 4: announce real payments.

## 4. What is still unverified (honest register)

- **Webhook E2E behaviors are code-audited, not yet executed** against a live DB (blocked: production DB paused — see worklog Task 43). The signature gate IS verified live on production.
- NylonPay delivery retry schedule (~5 fast, then nightly, ~10 total) is the provider's documented contract — reconfirm on the Webhooks doc page when configuring the key.
- Level 1 monthly limit and any Level 2 tiers: taken from official docs October 2026; confirm current terms with NylonPay during KYC.
