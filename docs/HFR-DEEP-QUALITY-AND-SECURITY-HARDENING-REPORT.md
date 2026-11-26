# House For Rent — Deep Code Quality Review, Security Hardening & Chinese-Language Removal Report

**Round:** 72 (engineering follow-up to Rounds 70–71, owner-commissioned)
**Date:** 2026-11-26
**Branch:** `chore/hfr-hardening-followup` (created from `chore/hfr-codebase-cleanup` @ `92fa56c`, which carries the Round-71 cleanup series on top of `main` @ `4055771`)
**Report location:** `docs/HFR-DEEP-QUALITY-AND-SECURITY-HARDENING-REPORT.md` (this file)
**Production contact:** none. **Production migrations:** none. **Deploy:** none. **Merge to main:** none.

---

## 1. Starting state (verified fresh, not assumed)

| Item | Value |
|---|---|
| Local `main` | `4055771` (Round-70 handover docs; 1 ahead of `origin/main`) |
| `origin/main` | `ad93c96` (deployed production) |
| `chore/hfr-codebase-cleanup` | `92fa56c` — five reviewable Round-71 cleanup commits, unpushed |
| Working tree | clean, nothing stashed; `backup-pre-rewrite` preserved at `1daf5bc` |
| Deployment | `houseforrentug.vercel.app` (Round-69 verified live; no deploy performed this round) |

Environment note (recorded honestly): the development sandbox force-re-checks out `main` in the primary clone repeatedly (this also happened twice during Round 71). All Round-72 work therefore ran in a dedicated `git worktree` (`/home/z/hfr-hardening`) pinned to the follow-up branch; the branch refs and commits are unaffected by the sandbox's checkout behaviour. Every gate below was run inside that worktree against the branch tree.

## 2. Baseline vs final validation (same gates, before and after)

| Gate | Baseline (before changes, `782a4d0`) | Final (after all changes) |
|---|---|---|
| `npx tsc --noEmit` | 0 errors | 0 errors |
| ESLint (`npm run lint`) | clean | clean |
| finance-pipeline suite | **166/166** | **166/166** |
| authz-regression suite | **67/67** | **80/80** (+13 new error-status checks) |
| kyc-pipeline suite | **80/80** | **80/80** |
| deal-uniqueness suite | **18/18** | **18/18** |
| image-pipeline suite | **38/38** | **38/38** |
| Production build (`npm run build`) | green | green |
| CJK scan (tracked text files) | zero | zero |

Baseline honesty note: the first two baseline suite runs (finance 166, authz 67) executed before the harness fix booted their rigs from the primary clone's tree, not the branch. They were superseded: the harness was fixed (commits `52f04fc`, `782a4d0`), and the entire baseline was re-established inside the worktree against the branch tree. The re-run baseline figures above are the authoritative ones.

Browser verification (dev server from the branch worktree, port 3000): homepage renders with full branded chrome and zero page errors; the branded 404 renders on a dead address; `/properties` renders 200; console shows only the pre-existing local-database noise of the sandbox (pages degrade gracefully — "Nothing live yet"). The new error boundaries compile (tsc/build) and are exercised only when a render actually fails, which cannot be triggered from the outside without injecting a fault — stated explicitly rather than claimed.

## 3. Follow-up item 1 — API error handling (bare-Error→500 paths)

**Scope examined:** commit `3622d97` diff, the Round-71 worklog preserved-items list, all 76 API routes, and every bare `throw new Error(` in `src/` (16 sites — all inspected in context, callers traced).

**Classification and outcome (each correction verified over real HTTP by a new regression check):**

| Site | Condition | Was | Now | Test |
|---|---|---|---|---|
| `landlord/properties/route.ts` ×3 | bedrooms / bathrooms / requiredMonthsUpfront out of range | 500 | **400 VALIDATION** (ApiError; siblings `propertyType`/`furnished` were already 400 from the QA round — these three were missed in the same file) | R72 bedrooms / months |
| `viewings/[id]/field-report/route.ts` | bad `conditionRating` | 500 | **400 VALIDATION** | R72 conditionRating |
| `ops/config/route.ts` | `commission_rate_bp` outside 1..10000 | 500 | **400 VALIDATION** | R72 rate ×2 |
| `ops.setListerTier` | invalid tier string | 500 | **422 VALIDATION** (mirrors the admin tier route's existing pre-check so service and HTTP edge cannot drift) | R72 unknown tier |
| `ops.setListerTier` | unknown partyId | 500 | **404 PARTY_NOT_FOUND** (`PartyNotFoundError` — the class already existed unused in the same file) | R72 unknown party |
| `viewings.requestViewing` | listing not live | 500 | **409 LISTING_NOT_LIVE** (new domain error) | R72 not-live listing |
| `viewings.fileFieldReport` | viewing not in `scheduled` state | 500 | **409 VIEWING_NOT_SCHEDULED** (new domain error) | R72 no-show viewing |
| `viewings.fileFieldReport` | duplicate field report | 500 | **409 FIELD_REPORT_EXISTS** (new domain error) | R72 duplicate report |
| `deals.resolveDispute` | deal not on `dispute_hold` | 500 | **409 DEAL_NOT_ON_DISPUTE_HOLD** (new domain error) | R72 resolve-dispute |
| `listings.withdrawListing` | listing id does not exist | 500 | **404 LISTING_NOT_FOUND** (same family the B-4 round fixed for publish dry-run; the 403 ownership check is preserved and tested) | R72 withdraw ×2 |

**Deliberately preserved as 500 (internal invariants — verified by caller analysis, not assumption):** `deals.resolveDispute` missing `dispute_hold` transition row; `deals.revertToPrePendingStatus` missing transition row; listings commission bootstrap missing actor (inside the P0-2 area — untouched); `ledger.reversePosting` unknown posting (all callers internal: `finance/refunds.ts` only).

**Contract statement:** error paths only — 500 becomes 4xx with a named code; success responses unchanged; all existing error codes unchanged; four additive codes; one error message now includes the listing id (ids are public marketplace identifiers).

## 4. Follow-up item 2 — Next.js error boundaries

**Audit finding:** no `error.tsx` existed anywhere in the app — any unhandled render error fell through to Next.js's unstyled default screen: no brand, no recovery, no correlation id.

**Implemented (`1dba704`):**
- `src/app/error.tsx` — route-segment boundary in the established design language (`notfound-wrap`/`notfound-mark`, honest copy). Offers retry (`reset()`) and homepage. Surfaces the opaque Next.js `digest` (safe) so a user report can be matched to the server-side log entry, which already carries the same digest. **Never renders the error message or stack.** Logs to the browser console only — nothing is transmitted anywhere.
- `src/app/global-error.tsx` — root-layout failure fallback; ships its own `<html>/<body>` per Next's contract and stays inline-styled because global CSS is not guaranteed when the root layout itself failed.

**Recommendation not implemented (documented):** a browser-error reporting endpoint (client errors currently have no server collection channel; the digest-correlation design above is the deliberate minimal step).

## 5. Follow-up item 3 — `session.refresh_token_hash` uniqueness

**Investigation evidence:** sole writer `issueSession` mints a fresh 256-bit CSPRNG token per sign-in (SHA-256 hex stored); **no rotation/refresh flow exists**; lookups are `findFirst` (`resolveSession`) and `updateMany` (`revokeCurrentSession`); no unique index in the schema, migrations, or code. **Conclusion: duplicates are excluded by construction today — no exploit path, NOT a live defect. The constraint is defense-in-depth** closing the silent failure class (future bug, sloppy restore/import) where `findFirst` would resolve one arbitrary row.

**Delivered (`95a298c`), NOT applied anywhere:**
- DRAFT migration `prisma/migrations/20261126120000_session_refresh_token_hash_unique/migration.sql` — additive `CREATE UNIQUE INDEX` with an in-transaction guard that refuses to apply if duplicates already exist; header documents preflight SQL, apply rails, lock note, rollback.
- `prisma/schema.prisma` — `Session.refreshTokenHash` gains `@unique` (the established DRAFT convention: rigs regenerate from the datamodel, so all suites now exercise sessions under the constraint; production stays untouched until the owner applies).
- `docs/MIGRATION_PROPOSAL_REFRESH_TOKEN_UNIQUENESS.md` — full evidence table, preflight, apply procedure, risk/lock/rollback assessment.
- The stale comment in `auth.ts` (which documented the gap) now describes the intended constraint. No behaviour change before or after application.

**Validation:** `prisma validate` OK; `prisma migrate diff --from-empty --to-schema-datamodel` emits exactly the migration's index (schema↔migration parity); authz 80/80, finance 166/166, deal 18/18 exercise login/session journeys on the amended datamodel.

## 6. Follow-up item 4 — Vercel build override / `apps/web` / lockfiles

**Facts confirmed:** the Vercel dashboard carries the v0 Build Command override `npm run build --workspace @hfr/web`; `apps/web` is a one-file delegation shim; root `workspaces` exists only so that command resolves; dashboard settings outrank `vercel.json`, so the repository cannot self-correct.

**Isolated verification (both states proven in a throwaway `git archive` extraction; the repository itself untouched):**
- State A (today): `npm ci` exit 0, then `npm run build --workspace @hfr/web` exit 0 — the shim path works.
- State B (post-cutover): `apps/web` + `workspaces` removed, fresh `npm ci` exit 0, plain `npm run build` exit 0 — the repo is already valid in its reduced shape.

**Delivered (`7c5c747`):** `docs/DEPLOYMENT_CONFIG_PROPOSAL.md` — facts table, verification evidence, and the ordered owner runbook (clear override → deploy-verify → *then* remove the shim → then consolidate on one lockfile, with the bun-vs-npm decision left to the team). **`apps/web`, `workspaces` and both lockfiles are deliberately still in place** — removing them before the dashboard change breaks every deploy.

## 7. Follow-up item 5 — CI

**Implemented (`673da13`):** `.github/workflows/ci.yml` — validation only, **no deploy job, no secrets, no environment configuration**. Single sequential job on `ubuntu-latest`: checkout → Node 22 (npm cache) → bun (the rigs spawn `next dev` via `bunx`) → `npm ci` → lint → `tsc --noEmit` → the five regression suites in fixed order → production build. Triggers: `pull_request`, `push` to `main`, `workflow_dispatch`; concurrency cancels superseded runs. YAML validated (pyyaml). Every command the workflow runs was executed locally against this tree with exit 0; the first GitHub-hosted run itself can only be observed after push — stated honestly.

**Enabler discovered and fixed en route:** all five suites hardcoded `REPO = '/home/z/my-project'`, so rigs always booted the primary clone's tree (never a worktree or CI checkout) and collided with its dev-server lock — they could never have run on CI at all. Now checkout-relative (`52f04fc`), with process-group teardown hardened (`782a4d0`) after a leaked rig was observed holding the `.next/dev/lock` and breaking the next suite — exactly the failure mode that would have made CI flaky.

## 8. Follow-up item 6 — retention

Confirmed present and untouched: `media-repair/2fc17b30-…/sources.json` (the substitute-photo provenance record, including the four `z-cdn.chatglm.cn` source URLs — deliberate disclosure, retained verbatim) and `docs/REPOSITORY_HYGIENE_AUDIT.md` with its dated addendum (audit body preserved unchanged).

## 9. Security review — classified findings

**Confirmed defects (corrected this round, each with regression evidence):**

| Severity | Finding | Correction |
|---|---|---|
| MEDIUM | 11 client-caused error paths surfaced as opaque 500s (masks caller mistakes from monitoring, misleads API consumers; no data exposure) | honest 4xx + named codes; 13 new HTTP-level checks |
| LOW | No error boundaries anywhere: unstyled dead-end on render errors, no recovery, no correlation | error.tsx + global-error.tsx |
| LOW | Session token-hash uniqueness enforced nowhere (duplicates excluded only by construction; silent `findFirst` ambiguity possible after a future bug/restore) | DRAFT unique index + guard, approval-gated |
| INFORMATIONAL | Test rigs booted the wrong checkout's tree (hardcoded absolute path) — regression evidence could be attributed to the wrong tree | checkout-relative rigs + process-group teardown |

**Confirmed NON-defects (checked, left alone):** the API edge's 500 fallback discloses the error *class name only*, never messages (verified in `src/server/http.ts`); `reversePosting`'s 500 is correct (internal invariant, callers verified internal).

**Existing controls verified as working (evidence from this round's suite runs and source reads):** server-side session resolution with role guards (`requireRole`); ownership checks (403 NOT_YOUR_LISTING/NOT_YOUR_PROPERTY/NOT_ASSIGNED_OFFICER asserted in authz 80/80); officer read-path scoping (P-1 checks); active-deal uniqueness under concurrency (18/18 incl. 6-way race); durable rate limiting with fail-open pre-migration safety (P-11 checks); webhook HMAC verification fail-closed without the secret, over raw bytes, with 5-minute freshness (`nylonpay.ts`; finance 166/166 drives signed webhooks); cookie flags httpOnly/sameSite=lax/secure-in-prod; missing-account vs wrong-password indistinguishability via dummy bcrypt hash; CSP + X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy headers unchanged in `next.config.ts`; append-only ledger with reconciliation (finance suite); immutability triggers catalogue (`scripts/recovery-triggers.sql`, unchanged).

**Potential weaknesses requiring further investigation (NOT corrected — owner items, unchanged by this round):** P0-2 commission-rate discrepancy (approved policy 10% landlord-borne vs bootstrap default 10000 bp at `listings.ts:457-459`; this round's rig output again showed `commissionRateBpSnapshot:10000` — a policy decision is required, and historical snapshots must not be rewritten); CSP `script-src 'unsafe-inline'` (needs nonce plumbing; documented as tracked follow-up in `next.config.ts`); provider custody / payout dispatch remain deliberately gated; P0-1 off-host backup copy; P0-3 Round-69 leaked credential rotation; `better_auth` migration-ledger ambiguity. No theoretical concern above is labelled a confirmed vulnerability.

## 10. Chinese-language removal (Phase Three)

- **Methodology:** `git grep -I -P` over all tracked files with the full CJK block set: CJK radicals (2E80–2EFF), punctuation (3000–303F), kana (3040–30FF — superset, would catch Japanese), CJK ext-A (3400–4DBF), unified ideographs (4E00–9FFF), compatibility ideographs (F900–FAFF), CJK compat forms (FE30–FE4F), fullwidth forms (FF01–FF60, FFE0–FFE6). Plus a filename scan and a no-`-I` pass to surface binary byte-coincidences explicitly.
- **Scope:** 340 tracked files (source, scripts, prisma, docs, config, worklog, media-repair manifest). Exclusions per the brief: `node_modules`, build output, gitignored sandbox tooling (`skills/`, `tool-results/`, `upload/`), binary files, package-manager lockfiles.
- **Occurrences found this round: 0. Occurrences corrected this round: 0.** The repository's only Chinese-language tracked content (8 `.zscripts` scripts + `tests/database-runtime-build.sh`) was removed in Round 71 together with the abandoned sandbox deploy chain; this round's fresh scan independently confirms the zero state (`definitive-exit=1` = zero matches).
- **Binary false positives (investigated, retained):** 20 JPG/PNG/ICO files match the raw-byte pattern without `-I` — binary coincidences, not text; all listed in the final scan record.
- **Legitimate non-English retained:** the four `z-cdn.chatglm.cn` provenance URLs in `media-repair/…/sources.json` (deliberate disclosure of where substitute photos came from) and worklog narrative references. **Final scan result: zero confirmed accidental CJK content in the tracked-file scope.**

## 11. Protected modules — inspected, not behaviourally changed

Authentication/session (`src/server/auth.ts` — comment-only change), authorization and role boundaries, ownership checks, approvals/identity-check flow, viewing and deal state machines (error *typing* only — transitions, guards, ledger effects, snapshot immutability untouched), commission calculation (untouched; P0-2 remains owner-gated), PSP/webhook layer, KYC pipeline, audit logging, transactions/Prisma usage patterns, rate limiting. Regression evidence: all five suites re-run green on the final tree (§2).

## 12. Tests added or modified

- **Added (13 checks, authz suite 67→80):** one HTTP-level assertion per corrected error path, including precedence (route validation before existence), the preserved 403 on cross-landlord withdraw, and both commission-rate bounds. All assert status **and** `error.code`.
- **Modified (harness only, no assertion changes):** `REPO` checkout-relative in five suites; rig process-group teardown on exit in four; KYC gains the stray-rig pkill/lock-clear/exit net the others had. Rationale: correct-tree testing and CI viability; observed failure mode documented in the commit messages.
- No test was deleted, skipped, or weakened. No failing test exists in the final state.

## 13. Change control — what was deliberately NOT done

No business-rule, financial-calculation, commission-rate, auth-behaviour, KYC, webhook-verification, or ledger change. No schema or migration change outside the approval-gated DRAFT (§5). No API success-path or existing-code change. No dependency added, upgraded, or removed. No UI redesign (the boundaries reuse existing classes; `global-error` is inline-styled by necessity). No production contact, migration, deploy, merge, or history rewrite. The three pre-existing DRAFT migrations remain unapplied and untouched.

## 14. Files modified / added this round (branch `chore/hfr-hardening-followup`)

| Commit | Content |
|---|---|
| `52f04fc` | harness: rig root resolves from the checkout (5 suites) |
| `782a4d0` | harness: process-group teardown (4 suites; KYC gains the cleanup net) |
| `8bd4f54` | item 1: 9 files (3 routes, 5 server modules, `http.ts` map) + authz suite 13 new checks |
| `1dba704` | item 2: `src/app/error.tsx`, `src/app/global-error.tsx` |
| `95a298c` | item 3: schema annotation, DRAFT migration, proposal doc, auth.ts comment |
| `7c5c747` | item 4: `docs/DEPLOYMENT_CONFIG_PROPOSAL.md` |
| `673da13` | item 5: `.github/workflows/ci.yml` |
| (this commit) | item 6 + report + worklog Round 72 |

Secrets scan of the full branch diff (`main..HEAD`, 22,426 lines): no credential-shaped strings (two independent patterns, both clean). No value of any environment variable was printed at any point; the worktree's `.env` is untracked and mode 600.

## 15. Remaining risks and unresolved owner items

1. P0-2 commission-rate discrepancy (policy 10% vs deployed 10000 bp) — decision + one-line fix + snapshot policy, owner-gated.
2. The three pre-existing DRAFT migrations + this round's fourth (`refresh_token_hash` unique) await approval/application through the documented rails.
3. Vercel override cutover (§6 runbook) — dashboard action, then the shim removal.
4. Lockfile consolidation decision (post-cutover; bun vs npm — pick one).
5. CI's first GitHub-hosted run must be observed after push.
6. P0-1 off-host backup copy; P0-3 credential rotation; `better_auth` ledger ambiguity (pre-existing, unchanged).
7. Browser-side error reporting (optional endpoint) — recommended, not built.

## 16. Git state and delivery

Pushed to `origin` (both reviewable, neither merged): `chore/hfr-codebase-cleanup` (Round-71 series) and `chore/hfr-hardening-followup` (Round-72 series, 8 commits). `main` untouched at `4055771` locally, `ad93c96` on origin; no force-push, no history rewrite, no deploy. Review order recommendation: cleanup series first, then the follow-up (it builds on the cleanup tree).

A Natural Intellects developer can take over from: `README.md`, `docs/DEVELOPER_ONBOARDING.md`, the three proposal/report docs added this round, and `worklog.md` Rounds 70–72.
