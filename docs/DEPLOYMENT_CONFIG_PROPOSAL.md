# Deployment configuration — investigation results and cutover proposal

**Status:** Investigation + isolated verification complete. **No repository or production configuration has been changed.** The dashboard change is a production-owner action and is deliberately left to the owner; this document is the runbook for it.

Verified against commit `95a298c` (branch `chore/hfr-hardening-followup`), 2026-11-26.

## 1. Current state (facts)

| Artifact | Fact | Evidence |
|---|---|---|
| Vercel dashboard | Carries a v0-era **Build Command override**: `npm run build --workspace @hfr/web`. Dashboard settings take precedence over `vercel.json`, so this cannot be corrected from the repository. | `apps/web/package.json` description; Round-70/71 audits; deployment history (every production deploy used this path) |
| `apps/web/` | Contains exactly one file (`package.json`) whose build script is `cd ../.. && npm run build` — a pure delegation shim that makes the stale override resolve. No code, no dependencies. | `apps/web/package.json` |
| Root `package.json` | `workspaces: ["apps/web"]` exists only so the workspace-resolving override command can find `@hfr/web`. | `package.json` |
| `vercel.json` | `{ framework: "nextjs", outputDirectory: ".next" }` — no buildCommand (correctly: the security headers deliberately live in `next.config.ts`, not here). | `vercel.json` |
| Lockfiles | `bun.lock` (local dev, scripts, docs convention) + `package-lock.json` (the npm path the override invokes). Both refreshed together in Round 71. | `git show 5fb19f9 --stat` |

## 2. Isolated verification (both deployment states proven)

Both experiments ran in a throwaway extraction of the branch (`git archive HEAD` → `/tmp/hfr-isolated`), with `npm ci` and the dummy `DATABASE_URL` used by the test rigs. **Nothing in the repository was modified.**

| State | Simulation | Result |
|---|---|---|
| **A — today** | `npm ci` then `npm run build --workspace @hfr/web` (exactly what the dashboard override runs) | `npm ci` exit 0; build exit 0 — the shim path works |
| **B — post-cutover** | delete `apps/web/`, remove `workspaces` from `package.json`, fresh `npm ci`, plain `npm run build` | `npm ci` exit 0; build exit 0 — the repo no longer needs the shim |

Conclusion: the moment the dashboard override is cleared, the repository is already valid in its reduced shape. **Do not remove `apps/web` before the override is cleared** — State A is the only reason `apps/web` exists, and removing it early breaks every deploy.

## 3. Owner runbook (ordered; each step reversible)

1. **Vercel dashboard → Project → Settings → Build & Output Settings:** clear the Build Command override (and, if separately set, any Install Command override). Save.
2. Deploy any commit (or use Redeploy) and confirm the build log now shows Vercel's auto-detected Next.js build succeeding. Rollback at this point = re-entering the override (the shim is still in the repo, so nothing breaks).
3. **Only after step 2 is verified:** remove `apps/web/` and the `workspaces` field (a one-commit change: `git rm -r apps/web` + the `package.json` edit) — State B above is the proof this is safe. Delete this file's shim paragraph afterwards.
4. **Lockfile consolidation (separate decision, non-urgent):** post-cutover, Vercel no longer needs npm. The repository's documented convention is bun (scripts, onboarding docs). If the team confirms bun, delete `package-lock.json` and standardise on `bun install --frozen-lockfile` (CI included); if the team prefers npm, delete `bun.lock` instead. Pick exactly one; carrying both indefinitely invites drift. Until this decision, keep both refreshed together as Round 71 did.

## 4. Deliberately not done in this task

- No change to `vercel.json` (a `buildCommand` there would not override the dashboard anyway, and adding one invites a second source of truth).
- No deletion of `apps/web`, `workspaces`, or either lockfile (approval-gated per §3).
- No production deploy, no Vercel settings touched (no credentials, no access from this session).
