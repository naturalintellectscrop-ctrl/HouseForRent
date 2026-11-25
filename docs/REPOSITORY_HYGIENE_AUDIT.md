# House For Rent — Repository Hygiene Audit (z_scripts / agent traces)

**Status:** Written 2026-11-11 from a read-only audit at commit `ad93c96`. **Nothing was deleted, renamed, relocated or rewritten.** This document is the requested investigation + proposed cleanup plan **for owner approval**. Labels: **[Verified in source code / git metadata]**, **[Verified on disk this audit]**, **[Reported by previous agent]**.

> **ADDENDUM — 2026-11-11, post-audit execution.** Under the owner's subsequent cleanup mandate, the following §8 recommendations were EXECUTED on branch `chore/hfr-codebase-cleanup`: `.zscripts/` + `tests/*.sh` + `examples/websocket` + `mini-services/.gitkeep` removed as one set (which also eliminated the repository's only Chinese-language tracked content); the shadcn/ui scaffold set + orphan hooks + `src/lib/utils.ts` + `components.json` removed; 50 unused dependencies pruned with both lockfiles refreshed; the inert Tailwind toolchain retired; the root package renamed `house-for-rent`; `.gitignore` tightened (`--full-page` and the redundant `/skills/media/` entry dropped, `!.env.example` added); `README.md` and `.env.example` created. **Deliberately retained:** `Caddyfile` (active gateway config for this dev environment) and `apps/web/` (load-bearing for the Vercel Build Command override until it is cleared in the dashboard). The body below is preserved unchanged as the audit record.

---

## 1. The `z_scripts` question — ground truth

- A directory named `z_scripts` **does not exist and never existed** in git history: `git log --all -- z_scripts` is empty and `git ls-files` has zero such paths. **[Verified in git metadata]**
- The owner-referenced folder is **`.zscripts/`** (dot-prefixed). It **exists on disk and — critically — all 8 of its files are currently GIT-TRACKED**, despite the `.gitignore` line `.zscripts/` (line 63): gitignore does not untrack already-committed files. **[Verified on disk + git metadata this audit]**
- They were committed 2026-09-29 in the agent checkpoint commit `9dc9e7e` (message is a bare UUID: `4ab74f47-3d7f-4ed6-b568-c727eba9b6f9`) — the same commit that added `tests/`, `examples/`, `Caddyfile`, `bun.lock` and a then-tracked `.env`. **[Verified in git metadata]**
- Provenance: these are **Z.ai sandbox ("workspace-agent") deployment scripts** — the one-click sandbox deploy model (Caddy on :81, SQLite at `/app/db/custom.db`, Aliyun-FC-style packaging). That model is **obsolete for HFR**: production is Vercel + Supabase PostgreSQL. **[Verified in source code of the scripts themselves]**
- Historical notes: `.zscripts/dev.pid` was properly untracked (commit `0c90f7c`) and no longer exists; `.zscripts/gen-site-images.sh` is cited in `worklog.md:766` but exists neither on disk nor in git (lost tooling — would need recreation if brand imagery is ever regenerated). **[Reported by previous agent / verified absent]**

### 1.1 `.zscripts/` file-by-file inventory (8 files, all tracked)

| File | Purpose | Referenced by | Required? | Sensitive? | Z.ai/agent refs? | Disposition |
|---|---|---|---|---|---|---|
| `build.sh` (7.3 KB) | Master sandbox deploy-packager (bun build, self-heals `next.config.ts` if `output:"standalone"` missing — **mutates a tracked file as a side effect**, tars deploy bundle incl. mini-services + Python runtime) | Indirectly by `tests/*.sh`; sandbox Deploy feature | Sandbox deploy only — obsolete vs Vercel | No | Yes — "workspace-agent" comments; sandbox model | **Remove (as a set)** if sandbox deploy is retired |
| `start.sh` (4.4 KB) | Launcher for the sandbox tarball: runs `next-service-dist/server.js`, **ships a SQLite db to prod**, starts Caddy | None tracked | Same | No | Yes (model) | Remove (set) |
| `dev.sh` (4.2 KB) | Sandbox dev bootstrapper (`bun run db:push` + dev + mini-services; logs into `.zscripts/`) | Documented failing in `worklog.md:1269` | Superseded by `scripts/dev-local-stack.mjs` + `scripts/restart-dev.sh` | No | Yes (model) | Remove (set) |
| `mini-services-install.sh` | `bun install` per dir under `mini-services/*` | None | No-op — `mini-services/` holds only `.gitkeep` | No | No | Remove (set) |
| `mini-services-build.sh` | `bun build` mini-services | None | No-op | No | No | Remove (set) |
| `mini-services-start.sh` | Runs built mini-services | None | No-op | No | No | Remove (set) |
| `python-runtime-build.sh` | `uv` freeze of Python deps into the deploy artifact | Executed by `tests/python-runtime-*.sh` | No-op for this repo (zero Python sources) | No | No | Remove (set) |
| `database-runtime-build.sh` | Copies `db/custom.db` (SQLite) into the deploy package + `db:push` | Executed by `tests/database-runtime-build.sh` | SQLite-era — contradicts Postgres production | No | No | Remove (set) |

No file in `.zscripts/` contains secrets (paths only). **[Verified this audit]**

## 2. Other sandbox / ignored directories

| Path | Git status | Contents | Assessment | Disposition |
|---|---|---|---|---|
| `skills/` (3.4 MB) | Ignored; **untracked** since commit `0891203` (was tracked pre-rewrite) | 21 Z.ai agent-skill packages (ASR/LLM/VLM/TTS/docx/pdf/pptx/xlsx/charts/…) with heavy `z-ai`/`GLM` references; scripts import `z-ai-web-dev-sdk` | Pure sandbox-agent tooling; **zero product references**; re-provisioned by the sandbox per session | **Remove from any handover copy**; never run its scripts |
| `tool-results/` (696 KB) | Ignored; untracked | 19 `read_*.txt` agent Read-tool output captures | Agent scratch | **Remove** — zero consequence |
| `upload/` (9.2 MB) | Ignored; never tracked | 36 `pasted_image_*.png` chat screenshots + design inputs (`Wireframe_Low-fi ui.*` — cited as the redesign input at `worklog.md:491` — and `Task Management Dashboard.*`) | Screenshots disposable; wireframe has design provenance | Remove screenshots; **keep/relocate the wireframe** (e.g. `docs/design-inputs/`) |
| `backups/` (92 KB) | Ignored ("disaster-recovery exports contain real personal + money data — NEVER commit") | **The first verified production export** + sha256 sidecar + preflight JSON + stderr log + `trigger-ddl.sql` | The most important files in the repo. `backups/trigger-ddl.sql` is byte-identical to tracked `scripts/recovery-triggers.sql` minus its 12-line header | **DO NOT TOUCH — copy off-host first** (RELEASE_READINESS P0-1); `trigger-ddl.sql` duplicate is removable **after** the off-host copy exists |
| `media-repair/` | **Tracked** (5 files; Rounds 63/69) | 4 staged replacement JPGs for listing `2fc17b30-…` + `sources.json` provenance manifest (documents that the photos are *representative images from public listings, not the actual unit*; source URLs include `z-cdn.chatglm.cn` — Z.ai CDN) | Deliberate disclosure/audit record after the Round-56 media loss | **Keep** — deleting it destroys the provenance that these are substitute photos |
| `mini-services/` | Tracked: only `.gitkeep` | Empty placeholder for a never-used scaffold feature | Exists so the `.zscripts` mini-scripts don't break | Remove **with** the `.zscripts` set |
| `examples/websocket/` | Tracked | Scaffold socket.io chat demo (sandbox `XTransformPort` convention) | **Unbuildable** — `socket.io` is not a dependency; zero references | **Remove** |
| `tests/*.sh` (3 files) | Tracked | Sandbox deploy-pipeline tests (`python-runtime-build.sh`, `python-runtime-container.sh`, `database-runtime-build.sh`) referencing `.zscripts` and a `z-ai-python-deploy-runner` image | Cannot run here; tied to the sandbox model | Remove **as a set with `.zscripts`** |
| `Caddyfile` | Tracked | Sandbox reverse proxy (`:81 → localhost:3000` + `XTransformPort`) | Sandbox infrastructure, not product config | Remove (set) if sandbox path retired |
| `db/`, `media/`, `download/`, `.next-rig/`, `dev.log`, `server.log`, `test`, `prompt`, `--full-page` | Ignored entries | **Do not exist on disk** (dormant gitignore lines) | — | Gitignore tightening candidate |

## 3. Whole-repository AI-agent reference sweep

Method: tracked files via ripgrep (respects gitignore) + explicit sweeps of hidden/ignored dirs (`rg --no-ignore --hidden`) + git-archaeology checks. **[Verified this audit]**

Pattern hits in the repo's own files: `chat.z.ai` **0** · `z.ai` 24 (all in `skills/`) · `GLM` 22 (all in `skills/`, plus lowercase `chatglm` in `media-repair/sources.json`) · `z-ai` 36 · `claude/CLAUDE` **0** · `aider` **0** · `windsurf` **0** · `copilot` **0** · `cursor` 20 (all CSS `cursor:` properties) · `agent` 54 (mostly product-domain terms like `broker_agent`, `User-agent`, and worklog narrative).

Classified hits worth knowing about:

| File : line | Class | Notes |
|---|---|---|
| `package.json:85` `"z-ai-web-dev-sdk": "^0.0.18"` | **(a) unused dependency** | Repo-wide import search: **zero imports in `src/` or `scripts/`** — only lockfiles and `skills/` reference it. Prune candidate |
| `bun.lock`, `package-lock.json` | (a) | Resolution entries for the SDK |
| `tests/python-runtime-container.sh:5` `RUNNER_IMAGE="z-ai-python-deploy-runner:test"` | (c) sandbox infra inside a tracked test | Goes with the `.zscripts` set |
| `.zscripts/build.sh:8,104,138` "workspace-agent" | (c) agent tooling (tracked) | Goes with the set |
| `media-repair/…/sources.json` — 4 × `https://z-cdn.chatglm.cn/...` | **(b) deliberate provenance record** | Documents where substitute photos came from; keep with `media-repair/` |
| `worklog.md:892` "the z-ai image-search upstream service is down…" | (b) narrative | Continuity record |
| `worklog.md:3` operator/session headers; "Agent: cron webDevReview" round headers | (b) narrative | The worklog IS the agent-session record — not an artifact to scrub |
| `docs/AUDIT_ROUND59…`, `ROLE_PERMISSION_MATRIX.md`, `REVIEW_LOG.md`, `FEATURE_VERIFICATION_MATRIX.md` — "agent-browser" QA mentions | (b) QA methodology | Legitimate |
| `skills/**`, `tool-results/*`, `upload/pasted_image_*` | (c) agent artifacts | Untracked/ignored; cleanup candidates |
| Historical: commit `e1a4acf` "Scrub historical tool references from comments, docs and ignore rules" | (b) | An intentional prior scrub already happened; the remaining traces above survived it deliberately or in gitignored dirs |

No `AGENTS.md`, `CLAUDE.md`, `.cursor/`, `.aider*` or agent-config files exist anywhere (tracked or untracked). No tracked filename matches agent-artifact patterns. **[Verified this audit]**

## 4. Git archaeology

- **`backup-pre-rewrite` branch** (149 commits, tip `1daf5bc`, tree byte-identical to `main`'s `506fce3`): preserves the **pre-rewrite lineage** — a history scrub/rewrite occurred (also commit `e1a4acf` "Scrub historical tool references…"), and the old line was deliberately kept. Both lines share the same commit subjects with different hashes; sole common ancestor is the scaffold commit `521aeee` (2026-07-26). **Keep the branch** until the team is confident; it is the rollback for the rewrite. **[Verified in git metadata]**
- **`.env` was tracked historically** (added in the checkpoint era, untracked in `1a70dad`/`fe76d8f` "Untrack sandbox environment files"). Every historical snapshot checked held a **`file:` SQLite URL** — no cloud credential appears in history. Values were scheme-checked only, never printed. Advise a history review before any future open-sourcing. **[Verified in git metadata]**
- Commit-message conventions: single-line "evidence-summary" messages (500–900 chars) documenting work + suite results; sporadic topical prefixes; **two bare-UUID accidental commits** (`9dc9e7e`, `316ca8a`) worth knowing about when reading history. No tags exist. **[Verified in git metadata]**

## 5. Root-level artifacts

| Artifact | Fact | Disposition |
|---|---|---|
| `package.json` name `nextjs_tailwind_shadcn_ts` | Z.ai scaffold name; product identity exists only in the `apps/web` shim | Rename to `house-for-rent`/`@hfr/web` (cosmetic, low risk) |
| **Unused dependencies** (verified zero imports): `z-ai-web-dev-sdk`, `next-auth`, `zod`, `next-themes`, `next-intl`, `framer-motion`, `zustand`, `@tanstack/react-query` + react-table, recharts, dnd-kit×3, embla, `@mdxeditor/editor`, react-syntax-highlighter, react-markdown, uuid, react-day-picker, react-hook-form, input-otp, sonner, vaul, cmdk, chart.tsx deps, and the whole unused `src/components/ui` shadcn set + `tailwind.config.ts` + `src/hooks/use-toast.ts` | Scaffold residue; enlarges install/attack surface and confuses newcomers (they assume the wrong design system) | **Remove in batches** (dependency groups one PR at a time; run suites after each). Keep `@hookform/resolvers`? — also unused; verify per batch |
| Dual lockfiles `bun.lock` + `package-lock.json` | bun = scripts/docs/dev; npm = the Vercel Build Command override | **Keep both until** the override is cleared; then consolidate (recommend bun, matching all docs) |
| `apps/web/` | No-code shim satisfying the stale Vercel override — **load-bearing today** | Clear the override in Vercel → then delete dir + `workspaces` entry |
| `.env` permissions **755** | Sandbox anomaly; `.env.prod` is 600 | `chmod 600 .env` |
| `.env.example` | Missing | Add with variable **names** only |
| `.gitignore` oddities | `test` and `prompt` ignore same-named files anywhere; `--full-page` is an agent-browser screenshot-flag filename; `local-*` already swallowed a script once (worklog:1269); `/skills/media/` redundant given `/skills/`; `.zscripts/` line ineffective while files stay tracked | Tighten/anchor; if `.zscripts` should become untracked, that requires `git rm --cached` (owner approval) |
| `Caddyfile`, `examples/`, `tests/`, `mini-services/` | Sandbox scaffold | See §2 |
| `worklog.md` at root | The continuity record (69 rounds) | **Keep** (optionally relocate to `docs/` — but update every reference if so) |

## 6. Files critical to operations — NEVER remove

`scripts/db-export.mjs`, `scripts/db-restore.mjs`, `scripts/production-recovery-drill.mjs`, `scripts/recovery-drill.mjs`, `scripts/run-recovery-target.mjs`, `scripts/recovery-triggers.sql`, `scripts/recovery-out-of-band-tables.sql`, `scripts/apply-migration.mjs`, `scripts/db-push-guard.mjs`, `scripts/production-guard.mjs`, `scripts/verify-prod-db.mjs`, `scripts/verify-prod-finance-state.mjs`, `scripts/prod-gate-db-probe.mjs`, `prisma/schema.prisma`, `prisma/migrations/*`, `docs/DISASTER_RECOVERY.md`, `backups/export-2026-11-11T05-35-57-612Z.ndjson.gz` (+ sidecar + preflight artifacts, until the off-host copy is confirmed), the five test suites, `.env.prod` (untracked credential channel).

## 7. Consolidated disposition table

| # | Path | Disposition | Consequence of removal |
|---|---|---|---|
| 1 | `backups/` export set | **Keep** (copy off-host first) | Irreplaceable production backup lost |
| 2 | Recovery/DB scripts + SQL (§6) | **Keep** | Lose backup/restore/migration rails |
| 3 | `scripts/verify-restored.mjs` | **Investigate → remove or fix** (DR doc declares it STALE/do-not-use) | Removes a documented trip-hazard |
| 4 | `.zscripts/` (8 tracked files) | **Remove as a set** (requires `git rm --cached` + commit) — only if the sandbox deploy path is retired | Sandbox one-click deploy stops; Vercel path unaffected |
| 5 | `tests/*.sh` | Remove (same set decision) | Lose sandbox-pipeline test coverage only |
| 6 | `examples/websocket/` | Remove | None (unbuildable, unreferenced) |
| 7 | `Caddyfile`, `mini-services/.gitkeep` | Remove (set) | None for Vercel path |
| 8 | `skills/`, `tool-results/`, `upload/pasted_image_*` | Remove from handover copies | None (agent scratch; sandbox re-provisions skills) |
| 9 | `upload/Wireframe_Low-fi ui.*` + `Task Management Dashboard.*` | **Keep but relocate** → `docs/design-inputs/` | Lose the documented design provenance |
| 10 | `media-repair/` | **Keep** | Destroys the substitute-photo disclosure |
| 11 | `z-ai-web-dev-sdk` + unused dep batches | Remove (batched, suites after each) | Smaller install/attack surface; no product impact |
| 12 | `apps/web/` + `workspaces` | Remove **after** the Vercel Build Command override is cleared | Breaking the build if removed early |
| 13 | Dual lockfiles | Investigate → consolidate post-#12 | Wrong choice breaks bun or npm flows |
| 14 | `.env` mode 600; add `.env.example` | Keep + fix | None |
| 15 | `.gitignore` lines `test`/`prompt`/`--full-page`/`local-*`/`/skills/media/` | Tighten | Removes silent-ignore foot-guns |
| 16 | `worklog.md`, all `docs/` | **Keep** | Lose continuity/knowledge |
| 17 | `backup-pre-rewrite` branch | Keep (for now) | Lose the pre-rewrite rollback |

## 8. Proposed cleanup plan (FOR OWNER APPROVAL — nothing executed)

Ordered, low-risk first; each step is reversible or verifiable:

1. **Before any cleanup:** complete the off-host backup copy (P0-1) — the sandbox is ephemeral and `backups/` is the crown jewels.
2. `chmod 600 .env`; add `.env.example` (names only). Zero functional risk.
3. Delete `tool-results/` and `upload/pasted_image_*.png`; relocate the two design inputs to `docs/design-inputs/`. Untracked/ignored → zero repo impact.
4. Remove `examples/websocket/` (tracked; one commit). Zero risk.
5. Batch-remove unused dependencies (group 1: `z-ai-web-dev-sdk`, `next-auth`, `zod`, `next-themes`, `next-intl`; group 2: UI-adjacent: `framer-motion`, `zustand`, react-query/table, recharts, dnd-kit, embla, MDX, syntax-highlighter, markdown, uuid…), refreshing **one** lockfile per batch; after each batch run `tsc --noEmit`, ESLint, and the five suites. Decide the fate of `src/components/ui` + `tailwind.config.ts` in the final batch.
6. **Owner decision point — sandbox deploy chain:** if Vercel is the only path, remove `.zscripts/` (via `git rm --cached`, then delete) + `tests/*.sh` + `Caddyfile` + `mini-services/` as one commit. Vercel deploys and all recovery tooling are unaffected.
7. Tighten `.gitignore` (anchor/drop `test`, `prompt`, `--full-page`, `local-*`; drop `/skills/media/`). One commit.
8. In the Vercel dashboard: clear the stale Build Command override → then delete `apps/web/` + the `workspaces` entry → consolidate on a single lockfile.
9. Resolve `scripts/verify-restored.mjs` (delete or fix to the documented recovery-gate contract) and record that `.zscripts/gen-site-images.sh` is lost tooling.
10. Optional, before any future open-sourcing: history review for the historical tracked `.env` (SQLite `file:` URLs only) and the two bare-UUID commits; consider renaming the root package.

**Consequence statement:** steps 2–5, 7 are zero-to-low risk and reversible; step 6 is the only one that removes a working capability (sandbox one-click deploy), and it is precisely the capability the current production architecture (Vercel + Supabase) has replaced. No step touches production, the database, credentials, or the recovery toolchain.
