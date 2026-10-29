# Role & Permission Matrix — derived from the actual authorization implementation

**Task ID:** 3 (Phase 3) · **Date:** 2026-10-28 · Evidence keys: **C** = code (file:line) ·
**E** = observed in the Phase-3 isolated-rig E2E run (real registrations → real admin-UI approval →
API journeys; rig = PGlite + next dev :3111, nothing touches production).

## 1. Roles and how each one comes into existence

| Role | Provisioned by | Initial account status | Evidence |
|------|----------------|------------------------|----------|
| tenant | self-service `POST /api/v1/auth/register` (role allowlist: only `tenant`/`lister` accepted) | `pending_verification` | C `auth/register/route.ts:18-27,30` · E |
| lister (landlord) | self-service register + auto `listerProfile(tier: property_owner)` | `pending_verification` | C `auth/register/route.ts:38-40` · E |
| foo (field officer) | admin only, `POST /api/v1/ops/staff` (never self-served) | active on creation | C `ops/staff/route.ts:11-24` · E |
| admin | platform-owner provisioning script / ops staff route | active | C `provision-platform-owner.mjs` |

**Activation has exactly one server path:** an identity check that passes flips
`pending_verification → active` (`ops.ts recordIdentityCheck`); the provider is the disclosed
sandbox mock (NIN structure `/^(CM|CF)[0-9A-Z]{12}$/` + name match, `ops.ts:36-42`), stated on
every surface. **Approval through the real UI was exercised in this round's E2E by an independent
admin (agent-browser driving /platform/approvals): three applicants approved, zero DB writes
outside the app.** Rejection (`pending_verification → suspended`, reason required) revokes
sessions and is refusal-safe under concurrency (409 on stale state) — round 49 evidence, unchanged.

## 2. Account-status policy (who can sign in / act)

| Status | Sign-in | Acts on platform | Evidence |
|--------|---------|------------------|----------|
| pending_verification | refused (generic `ACCOUNT_BLOCKED`) | no | C `auth.ts` sign-in policy · E (round 49: blocked sign-in shows generic message only) |
| active | yes | yes | E |
| suspended / disabled | refused (same generic message) | no; sessions revoked at decision time | C `ops.ts rejectAccountApplication` |

## 3. Surface × role matrix (server-enforced, all observed live)

| Surface | anon | tenant | lister | foo | admin |
|---------|------|--------|--------|-----|-------|
| Public browse/search `/`, `/api/v1/listings` | ✅ (only live+verified listings; honest empty state) | ✅ | ✅ | ✅ | ✅ |
| Register / login | ✅ | — | — | — | — |
| Create property+listing | 401 E | 403 E | ✅ E (lands `awaiting_verification`) | 403 | ✅ |
| Publish dry-run (blocker list) | 401 | 403 | ✅ own E | — | — |
| Publish (real) | 401 | 403 | ✅ own, gate-decided E (refused while unverified) | — | — |
| Withdraw | 401 | 403 | ✅ own E · 403 on others' E | — | — |
| Amend | 401 | 403 | ✅ own; 409 withdraw-first on live E | — | — |
| Photos (upload/delete) | 401 | 403 | ✅ own E · 403 others' E | — | — |
| Accept listing agreement | 401 | 403 | ✅ own E · 403 others' E | — | — |
| Landlord financials | 401 | 403 | ✅ scoped to own party E (B sees none of A's) | — | — |
| Verify-listing verdict | 401 | 403 E | 403 E | ✅ E | ✅ |
| Ops staff provisioning | 401 | 403 E | 403 E | 403 | ✅ E |
| Viewing dispatch | 401 | 403 | 403 | — | ✅ |
| Deals: create from introduction | 401 E | 403 | 403 | ✅ own introductions only (C `NotTheIntroducingOfficerError`) | ✅ |
| Deal actions (fund/confirm = tenant-party; sign/cancel = lister-party; earn/settle/refund/dispute = admin) | 401 | per matrix | per matrix | match-tenant only | all (C `DEAL_ACTIONS` + route re-check, E round 49 rails) |
| Reconciliation run/history | 401 | 403 | 403 | 403 | ✅ C `ops/reconciliation/route.ts:11,28` |
| Approvals queue / review / reject | 401 (307→/login on pages) | 403 | 403 | 403 | ✅ (E rounds 49+50) |
| Webhook (PSP) | HMAC signature only — 401 unsigned/bad, 503 unconfigured (C `webhook/route.ts:57-66`) | — | — | — | — |

**Non-party reads are 404, not 403** (deal detail, `deals.ts:833-836`) — existence of a resource
is not disclosed to strangers; ownership violations on landlord surfaces are 403 with the
`NotYourListingError` family.

## 4. The publish gate (the platform's core promise), server-side

One implementation, three consumers (`listings.ts publishBlockers:549-563`; dry-run E2E-verified):
`field_verification` · `outside_service_area` · `mandate` (non-owner tiers) · `listing_agreement` ·
`photography` (≥1 photo). Publication physically cannot reach `live` while any blocker stands —
observed live: unverified publish attempt refused (step 7), publish succeeded only after
verify+agreement+photo (step 9).

**Re-verification rules (observed live):** a PHYSICAL amendment (rooms/type/furnishing/location)
sets `reVerificationRequired: true` and resets `verificationState: unverified` — publish re-arms;
a TERMS-only amendment (rent/deposit/copy) keeps the officer's verdict
(`reVerificationRequired: false`). A LIVE listing must be withdrawn before amending (409 observed,
step 10). Re-verified → republished successfully (step 12).

## 5. Defects & observations from this round's run

| # | Severity | Finding |
|---|----------|---------|
| R-1 | Low (API quality) — **FIXED round 51** | `POST /api/v1/ops/staff` with a duplicate phone returned opaque **500 INTERNAL** (`PrismaClientKnownRequestError`) instead of a 409 — observed when re-provisioning the same officer. Fix: `provisionStaff` pre-checks the phone and throws `ApiError(409, 'PHONE_TAKEN')` (same courtesy register gives); the unique index remains the hard backstop. |
| R-2 | Low (API quality) — **FIXED round 51** | Direct (non-dry-run) publish of a gated listing threw a generic `Error` → **500 INTERNAL**. The block itself was honest and correct (nothing is published), but an API consumer got no blocker list. Fix: `publishListing` now throws `ApiError(422, 'PUBLISH_BLOCKED', …blockedBy…)` — same codes the dry-run reports. |
| R-3 | Informational (policy) | `POST /api/v1/viewings/:id/verify-listing` ignores the path id and lets any foo/admin verify ANY listing without a recorded visit (C `viewings.ts:553-580` — no visit linkage check). The platform copy says officers visit before verdicts; the schema trusts the officer. Structural fix (require a conducted viewing of that listing by the acting officer) is a business-semantics change → owner decision, recorded not implemented. |
| R-4 | Verified-positive | Cross-landlord ownership: every landlord-surface action by Landlord B on Landlord A's listing returned 403, and B's financials contain none of A's rows (step 13). |

## 6. E2E run summary (this round, isolated rig)

- **32 assertions passed / 5 initial failures — 4 were driver assertion-shape bugs (response echoes
  `{changedFields, reVerificationRequired}` rather than raw values), 1 real finding (R-1).**
- Full journey exercised: real register ×3 → admin-UI approval ×3 (agent-browser, screenshots) →
  landlord authors listing → gate blocks with exact codes → photo upload → agreement accept →
  still blocked → admin provisions FOO → FOO verifies → publish → LIVE → public search shows it →
  withdraw → physical amend → re-blocked → re-verify → republish → LIVE → ownership boundaries ×4 →
  anonymous/wrong-role rails ×4.
- Credentials live in gitignored `.env.test-rig` / the rig boot log only; nothing committed.
- **Post-fix verification (round 51, same rig after the sandbox-reset recovery):** R-1 duplicate
  staff phone → 409 PHONE_TAKEN; R-2 gated publish → 422 PUBLISH_BLOCKED with the blocker codes.
- **Sandbox-reset event:** mid-round the sandbox workspace rolled back to commit dc2aa07 (working
  tree, .env and rig state lost; nothing had been committed yet for round 51). Local main was
  restored from origin/main (`git reset --hard origin/main` at 7a30483 — the pushes of rounds
  49–50 survived remotely, which is exactly why single-branch-push-early matters). Round-51
  artifacts were re-created from session record and re-verified.
