# Disaster Recovery — House For Rent database

**Owner:** Natural Intellects Ltd · **Maintained by:** engineering · **Last revised:** October 2026 (production gate, Task 43)

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

> **NOT YET TESTED.** The production database is paused (owner decision) and the sandbox has no PostgreSQL server, so no restore has been executed yet. Per the launch rule: **no backup claim is made until a restore into a recovery database has been run and verified.** First test is queued as the first action after the database is resumed.

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
- The export/restore scripts are code-reviewed but **not yet executed against the real database** (blocked on resumption). Their first real run and the first restore test must be recorded in the worklog before any backup claim is made.
