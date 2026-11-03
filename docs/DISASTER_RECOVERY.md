# Disaster Recovery — House For Rent database

**Owner:** Natural Intellects Ltd · **Maintained by:** engineering · **Last revised:** 2026-11-03 (backup & recovery readiness round; §2a procedure added, §4 status corrected)

---

## 1. The situation, stated plainly

| Fact | Status | Evidence |
|---|---|---|
| Automated backups on Supabase **Free** plan | **NOT AVAILABLE** | supabase.com/docs/guides/platform/backups: automated daily backups apply to Pro/Team/Enterprise only; PITR is paid-only |
| Point-in-time recovery (PITR) | **NOT AVAILABLE on Free** | Same source; PITR is a paid add-on |
| What Free gives you | Dashboard manual exports + whatever you build yourself | Verified October 2026 |
| Supabase **Pro** ($25/mo/project) | Daily backups, **7-day retention**, restore-from-dashboard | supabase.com/pricing, verified October 2026 |
| Media (photo) objects | NOT covered by any database backup — storage buckets need their own copy strategy | §5 below |

**Consequence:** on the current Free plan, the ONLY safety net for real customer and money data is the export procedure in §2. Until that procedure has been run on a schedule AND a restore has been tested (§4), the platform must be considered to have **no working backup claim** — this document deliberately does not claim otherwise.

## 2. Export procedure (works on Free, through the pooler)

```bash
bun scripts/db-export.mjs            # DATABASE_URL from .env (Supabase pooler)
# → backups/export-<timestamp>.ndjson.gz  +  .sha256 sidecar
```

- Consistent snapshot: single transaction, `REPEATABLE READ`, opened `READ ONLY` (the run cannot mutate production even by accident).
- Format: NDJSON, one row per line (`{"table": …, "row": …}`), manifest with per-table counts last; gzip; SHA-256 sidecar for integrity.
- No `pg_dump` or direct-connection privileges needed; no secrets are written into the export or logs.
- Rows only — the schema is NOT in the file (see restore precondition).

### Schedule (minimum honest posture)

- **Daily**, and **always immediately before** any maintenance that touches data (purges, migrations, provider changes).
- Suggested automation once the DB is resumed: a scheduled runner (GitHub Actions private repo cron, or any machine the owner controls) executing the script with the connection string stored as an encrypted secret — never committed.

### §2a Exact operator procedure (added 2026-11-03 — six steps, verified bounds)

**Step 0 — Preconditions (checked before every run).**
- Owner has authorized THIS run and delivered the production `DATABASE_URL` (Supabase session pooler) through the approved mechanism only: the git-ignored `.env` / a runner secret. Never chat, worklog, repo, or screenshots.
- The sandbox shell historically exports a stale `DATABASE_URL=file:…` (SQLite era) that OVERRIDES `.env` for child processes — real env beats dotenv. Always launch with an explicit environment: `env DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" bun scripts/db-export.mjs` (the credential itself is never echoed).
- Never print, log, or paste the URL. The script reads it from env and writes no secret into the export, logs, or error messages (verified in code).

**Step 1 — Secure connection & identity check (read-only preflight).**
```bash
PROD_DATABASE_URL="$DATABASE_URL" node scripts/verify-prod-db.mjs
```
Forces a read-only session, confirms server identity/version, exact per-table counts, migration ledger state. Confirm the table list and counts look like production before exporting. This probe touches nothing.

**Step 2 — Consistent export.**
```bash
bun scripts/db-export.mjs --out backups
```
Single transaction, `READ ONLY` + `REPEATABLE READ` — one consistent snapshot; the run cannot mutate production even by accident. Discovers ALL `public` BASE TABLEs from the catalog at run time (includes out-of-band `ba_*` and `_applied_migrations`; excludes only `_prisma_migrations` bookkeeping). Chunked keyset reads (`ctid`, 2000/page) to stay inside pooler memory limits.

**Step 3 — Integrity & checksum verification (the proven trap).**
The sidecar digest is `sha256` of the **DECOMPRESSED stream**, NOT of the `.gz` container bytes — plain `sha256sum -c` on the `.gz` WILL FAIL (proven, roundtrip probe 2026-11-03). Verify with:
```bash
gunzip -c backups/export-<ts>.ndjson.gz | sha256sum   # must equal the sidecar
gunzip -c backups/export-<ts>.ndjson.gz | tail -1     # manifest: rowTotal + per-table counts
```
A truncated/interrupted export has NO sidecar and fails gunzip's CRC, and `db-restore` refuses any file whose last line is not the manifest — a misleading backup cannot pass verification.

**Step 4 — Metadata record (no secrets).** Record in the artifact table (§2a bottom): filename, UTC timestamp, byte size, sha256 digest, `rowTotal` + per-table counts from the manifest, the git commit of `scripts/db-export.mjs` used, and the operator. NEVER the connection string, project ref, or row contents.

**Step 5 — Independent copy.** Copy BOTH the `.gz` and its `.sha256` sidecar to storage OUTSIDE the production host and outside this sandbox (owner's machine or private object storage, different cloud region from the database), encrypted at rest, `chmod 600` in transit. The sandbox is EPHEMERAL — an artifact left only here has a documented history of being lost (the 2026-10-23 export was lost this way).

**Step 6 — Second-copy verification.** On the copy's host: `gunzip -c <copy> | sha256sum` must equal the recorded digest; compare byte sizes. Record both digests in the artifact table.

**Step 7 — Restore drill (same day).** `bun scripts/production-recovery-drill.mjs --file backups/export-<ts>.ndjson.gz` — restores the real export into a disposable local PostgreSQL (PGlite 16) and verifies counts vs manifest, FK-chain joins, JSONB roundtrip, ledger balance, and that the application's own Prisma client reads the rows. While connected for the export, also capture the append-only trigger DDL read-only (`select pg_get_triggerdef(oid) from pg_trigger where tgname='reject_mutation';`) so `scripts/recovery-out-of-band-tables.sql` can gain the trigger supplement it still lacks (§4 note).

**Artifact record (fill one row per export):**

| Field | Value |
|---|---|
| File + timestamp | `export-<ts>.ndjson.gz` |
| Bytes / sha256(decompressed) | — |
| rowTotal / non-empty tables | — |
| Exported by (script commit) | — |
| Off-host copy location + digest match | — |
| Same-day restore drill result | — |

**Verified bounds & traps (probes re-run 2026-11-03, all behaved as documented):**
1. Checksum = decompressed stream (use the `gunzip` pipe above).
2. Any bigint value ≥ 2^53 (9 007 199 254 740 991) is silently corrupted by JSON number parsing on the export path — safe while per-entry money amounts stay below ≈9.0×10¹⁵ minor units (realistic for UGX); re-check before any currency change. The corruption is invisible to the ledger-balance gate (probe: source off-by-1 → restored "balanced").
3. `db-restore` cannot load a non-null `text[]` row (`field_report.media_asset_ids` → 42804). Production currently has zero such rows; this becomes a REAL restore blocker the moment field officers file reports with media references — fix `buildInsert` before field-report go-live.
4. A failed restore leaves the target partially loaded (restore is non-transactional) — always re-create the target, never retry in place.
5. `scripts/verify-restored.mjs` is STALE (Prisma-camelCase columns, `amount_minor`) — it fails loudly (42703) on a real Postgres target. Do not use it; the canonical verification is `db-restore`'s built-in gates + `production-recovery-drill.mjs`.
6. Recovery schema = datamodel diff + out-of-band supplement; it does NOT include the production `reject_mutation` triggers (no `CREATE TRIGGER` exists anywhere in the repo) and does not include unapplied DRAFT migrations. A recovery DB therefore accepts UPDATE/DELETE on the 10 append-only-protected tables at the DB level — the append-only wall must be re-applied before any recovery DB serves traffic.

## 3. Where backups live, who can access, retention

| Question | Current answer (to be ratified by the owner) |
|---|---|
| Storage location | Local `backups/` directory of the runner by default; **must** be copied off the production host. Recommended: private object storage (e.g. private S3/GitHub private repo artifacts) in a different cloud region from the production database |
| Who can access | The owner and designated engineering operator only; the file contains real personal data and money records once real customers exist |
| Frequency | Daily (minimum) |
| Retention | Keep **30 daily** + **12 monthly** exports; delete older copies |
| Encryption | Encrypt at rest if the destination does not (the export contains personal data) |
| Access review | Re-check whenever staff changes |

## 4. Restore procedure (into a RECOVERY database — never overwrite production)

```bash
# one-time: create an empty recovery database, apply schema to it
RESTORE_DATABASE_URL="postgres://…recovery…" bun run db:push

# restore + verify
ALLOW_DB_RESTORE=yes bun scripts/db-restore.mjs \
  --file backups/export-<timestamp>.ndjson.gz --yes
```

The script refuses to run against the source URL, refuses a non-empty target, orders tables parents-first from the target's own FK catalogue, and then verifies:

1. per-table counts match the export manifest exactly;
2. **the ledger balances** — Σ(debit) = Σ(credit) across `ledger_entry` (deal/escrow money records must reconcile before the recovery DB is trusted).

### Post-restore verification checklist (before any cutover decision)

- [ ] Schema objects present (models, append-only `reject_mutation` triggers on the 10 protected tables)
- [ ] Counts match manifest for every table
- [ ] Ledger balances; spot-check one deal: its transitions, PSP instruction and ledger postings agree
- [ ] Application connectivity: point a disposable deployment at the recovery URL and sign in, load a listing, view the control center
- [ ] Record restore duration — this is the honest RTO

### Recovery-test status

> **STATUS CORRECTION (2026-11-03, readiness round):** the first REAL production export WAS taken through the Supabase pooler on **2026-10-23** (`backups/export-2026-10-23T15-32-24-446Z.ndjson.gz`, 76 rows / 13 non-empty tables) and the same-day `production-recovery-drill.mjs` run PASSED all checks on real data (recorded: worklog Task 45, commits 75c8c73/e256466). However, that artifact lived only in this ephemeral sandbox and is now GONE (sandbox reset); its sha256 was never recorded anywhere durable, and no independent off-host copy has ever been verified. **Honest current claim: the machinery is verified end-to-end (re-verified 2026-11-03: recovery drill all-PASS; roundtrip probes all behaved as documented); NO currently-valid production backup exists.** The next export must follow §2a exactly — checksum recorded durably + artifact copied off-host + second copy verified + same-day restore drill — before any backup claim is made.
>
> **MACHINERY VERIFIED (October 2026, launch-gate round 2).**
> `scripts/recovery-drill.mjs` executes the full pipeline end to end against a real, separate PostgreSQL instance (PGlite — Postgres 16 WASM — served over the wire protocol, exercised with the application's own Prisma client) using a **synthetic, clearly-labelled** export:
> - safety rails refuse (`ALLOW_DB_RESTORE` missing → exit 2; `RESTORE_DATABASE_URL == DATABASE_URL` → exit 2);
> - schema applied to a fresh target (34 tables); empty-target precondition holds;
> - parents-first load **including self-referencing tables** (`neighbourhood.parent_id` — the drill caught and fixed a real defect: the original topo-sort aborted on self-FKs, which real production data uses for districts);
> - manifest counts match exactly; ledger Σdebits = Σcredits; FK chains (listing→property→party→neighbourhood, agreement→rate version) join;
> - the application's own client reads the restored rows.
>
> **What this does NOT claim:** no production export has been taken yet — the export requires the production `DATABASE_URL`, which is held only in Vercel/Supabase (never in the sandbox; the credentials payload referenced by the owner was not received). The first real export + restore drill must be recorded here before any backup claim is made.
> **Drill note:** the PGlite socket target needs `?pgbouncer=true` on the connection string (simple query protocol — PGlite does not carry Prisma's named prepared statements across session reuse, `42P05`). Real PostgreSQL recovery targets do not need this flag.

## 5. Media (photos) — separate problem, stated honestly

The database export does NOT contain photograph bytes. Listing photos live in object storage (Supabase Storage in production). If media matters, its copy strategy is:

1. Keep the storage bucket's region/project independent from the database's failure modes where possible;
2. Sync objects out periodically (Supabase storage download / `rclone`) to the same off-site location;
3. `media_asset` rows carry `storage_ref` + `mime_type` + `byte_size`, so a restored database plus a media sync reconcile exactly.

## 6. Paid-plan trade-offs (evidence-based recommendation, not a decision)

| Option | Cost | What you get | Trade-offs |
|---|---|---|---|
| Stay Free + this script | $0/mo (owner's runner time) | Daily manual/automated logical exports; RPO ≈ 24h; restore is scripted but untested until DB resume | No PITR (up to 24h data loss window); no platform-managed restore; storage objects need separate sync |
| Supabase Pro | $25/mo/project | Platform-managed daily backups, 7-day retention, dashboard restore | RPO still up to 24h; no PITR in base plan; egress/bandwidth ceilings |
| Supabase Pro + PITR add-on | Pro + add-on (price to confirm on supabase.com/pricing before purchase) | Point-in-time recovery (seconds-level RPO) | Highest cost; still need off-site exports for provider-outage scenarios |

**Engineering recommendation (not yet a business decision):** at the moment real customer money records exist, move to Pro at minimum, keep the daily export as the provider-independent safety net, and re-evaluate PITR when deal volume makes a 24h loss window unacceptable.

## 7. Limitations of this document

- Written from verified sources in October 2026; Supabase plan terms change — re-verify pricing before any purchase.
- The export script is code-reviewed and its restore counterpart is **machinery-verified** (recovery drill, October 2026); neither has touched the real production database yet — the first real run and the first production restore test must be recorded in the worklog before any backup claim is made.
