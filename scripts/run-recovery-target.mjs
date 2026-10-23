/**
 * Recovery-target runner (launch-gate step 4).
 *
 * Starts a SEPARATE PostgreSQL instance (PGlite = real Postgres 16, WASM
 * build) on 127.0.0.1, applies the schema DDL regenerated from
 * prisma/schema.prisma, and serves it over the real Postgres wire protocol
 * so scripts/db-restore.mjs can treat it exactly like a networked recovery
 * database. Writes NO business data — the restore fills it.
 *
 * The target is local-only and disposable: a production restore drill never
 * touches any database referenced by DATABASE_URL (db-restore refuses
 * same-URL runs and requires ALLOW_DB_RESTORE=yes + --yes).
 *
 * Run:  bun scripts/run-recovery-target.mjs [--port 5577]
 * Stop: kill <pid>  (SIGTERM closes cleanly)
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i > -1 ? Number(process.argv[i + 1]) : 5577;
})();

const SCHEMA_SQL = path.join(REPO, 'backups', 'recovery-schema.sql');
mkdirSync(path.join(REPO, 'backups'), { recursive: true });

// Regenerate DDL from the schema (no live database needed; dummy URL satisfies
// the datasource env reference and is never dialed for --from-empty diffs).
execFileSync(
  'bunx',
  ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
  { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' }, stdio: ['ignore', 'pipe', 'inherit'] },
); // sanity: command must succeed
writeFileSync(SCHEMA_SQL, execFileSync('bunx', ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } }));

const db = new PGlite();
await db.exec(readFileSync(SCHEMA_SQL, 'utf8'));
const tbl = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
console.log(`[recovery-target] schema applied: ${tbl.rows[0].n} public tables`);

const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1' });
await server.start();
console.log(`[recovery-target] listening on 127.0.0.1:${PORT}`);
writeFileSync(`/tmp/hfr-recovery-target-${PORT}.ready`, new Date().toISOString());

const close = async () => {
  try { await server.stop(); } catch {}
  try { await db.close(); } catch {}
  process.exit(0);
};
process.on('SIGTERM', close);
process.on('SIGINT', close);
setInterval(() => {}, 1 << 30); // keep alive
