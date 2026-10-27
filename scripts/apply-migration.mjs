#!/usr/bin/env node
/**
 * apply-migration — apply ONE reviewed, additive migration SQL file to a
 * database and record it in the _prisma_migrations ledger, with rails.
 *
 * ── Why this exists ──
 * The repo's rule is "schema changes go through reviewed migrations, never
 * `prisma db push`". The historical prisma/migrations folder was lost (its
/// ledger rows remain on production; two failed better_auth rows currently
 * block `prisma migrate deploy` — an owner decision). This script applies a
 * single reviewed file with explicit rails and writes an honest ledger row
 * (checksum = sha256 of the file), so the ledger and the database agree.
 *
 * ── Rails (all required) ──
 * - TARGET_DATABASE_URL must be set and must NOT equal DATABASE_URL.
 * - ALLOW_PROD_MIGRATION=yes must be set (two-key convention, like db-restore).
 * - The migration file must live under prisma/migrations/ (no ad-hoc SQL).
 * - Idempotent: refuses if the migration name already exists in the ledger.
 * - Runs inside a transaction: either the DDL and the ledger row land
 *   together or nothing happens. (Postgres DDL is transactional.)
 *
 * Usage:
 *   TARGET_DATABASE_URL='postgres://…' ALLOW_PROD_MIGRATION=yes \
 *     node scripts/apply-migration.mjs prisma/migrations/<name>/migration.sql
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';

const fileArg = process.argv[2];
const TARGET = process.env.TARGET_DATABASE_URL;

function refuse(msg) {
  console.error(`apply-migration: refusing — ${msg}`);
  process.exit(2);
}

if (!fileArg) refuse('-- a migration.sql path is required');
const file = path.resolve(fileArg);
if (!file.startsWith(path.resolve('prisma/migrations') + path.sep)) {
  refuse('only files under prisma/migrations/ can be applied');
}
const migrationName = path.basename(path.dirname(file));
if (!/^\d{14}_[a-z0-9_]+$/.test(migrationName)) {
  refuse(`migration directory name must be <timestamp>_<name>, got "${migrationName}"`);
}
if (!TARGET) refuse('TARGET_DATABASE_URL is not set');
if (process.env.ALLOW_PROD_MIGRATION !== 'yes') {
  refuse('ALLOW_PROD_MIGRATION=yes is required (this tool writes schema)');
}
if (TARGET === process.env.DATABASE_URL) {
  refuse('TARGET_DATABASE_URL equals DATABASE_URL — wrong-tool protection');
}

const sql = readFileSync(file, 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');

const client = new pg.Client({
  connectionString: TARGET,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query('BEGIN');
  const ledger = await client.query(
    `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = $1`,
    [migrationName],
  );
  if (ledger.rows.length > 0) {
    await client.query('ROLLBACK');
    refuse(`migration "${migrationName}" already exists in the ledger (finished_at=${ledger.rows[0].finished_at})`);
  }
  console.log(`apply-migration: applying ${migrationName} (sha256 ${checksum.slice(0, 16)}…)`);
  await client.query(sql);
  await client.query(
    `INSERT INTO _prisma_migrations (id, checksum, migration_name, logs, started_at, finished_at, applied_steps_count)
     VALUES (gen_random_uuid()::text, $1, $2, NULL, now(), now(), 1)`,
    [checksum, migrationName],
  );
  await client.query('COMMIT');
  console.log('apply-migration: COMMIT — DDL and ledger row applied atomically.');
  const verify = await client.query(
    `SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations WHERE migration_name = $1`,
    [migrationName],
  );
  console.log('apply-migration: ledger row:', JSON.stringify(verify.rows[0]));
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('apply-migration: FAILED, rolled back:', err.message.slice(0, 400));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
