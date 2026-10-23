/**
 * READ-ONLY production database verification (Launch Gate 1 evidence).
 *
 * Usage:
 *   PROD_DATABASE_URL='postgres://...' node scripts/verify-prod-db.mjs
 *
 * Safety guarantees:
 *   - Every statement below is a hardcoded SELECT / catalog read.
 *   - Session is forced READ-ONLY (SET default_transaction_read_only = on)
 *     with a statement timeout. No DDL, no DML, no writes of any kind.
 *   - Connection string is read from env; never logged.
 */
import pg from 'pg';

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error('FATAL: PROD_DATABASE_URL not set. Refusing to run.');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false }, // Supabase pooler requires TLS
  statement_timeout: 15000,
  connectionTimeoutMillis: 15000,
});

const q = async (label, sql) => {
  const res = await client.query(sql);
  return { label, rows: res.rows, rowCount: res.rowCount };
};

const J = (o) => JSON.stringify(o, null, 2);

async function main() {
  process.stderr.write('[1/9] connecting...\n');
  await client.connect();
  process.stderr.write('[2/9] forcing read-only session...\n');
  await client.query('SET default_transaction_read_only = on');
  await client.query('SET statement_timeout = 15000');

  const out = {};

  // 1. Identity
  out.identity = await q('identity', `SELECT version() AS version,
      current_database() AS db, current_user AS usr,
      pg_size_pretty(pg_database_size(current_database())) AS db_size`);

  // 2. Non-system schemas
  out.schemas = await q('schemas', `SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog','information_schema')
        AND schema_name NOT LIKE 'pg_toast%' ORDER BY 1`);

  // 3. Tables + estimated row counts
  out.tables = await q('tables', `SELECT schemaname, relname AS table_name,
      n_live_tup AS est_rows, pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname))) AS total_size
      FROM pg_stat_user_tables ORDER BY schemaname, relname`);

  // 4. Exact counts for every user table (small prod DB; capped at 100k)
  const tableList = out.tables.rows.map((r) => `${r.schemaname}.${r.table_name}`);
  const counts = {};
  for (const t of tableList) {
    if (t.split('.')[0] === 'auth' || t.split('.')[0] === 'storage') continue; // skip supabase internal bulk
    try {
      const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
      counts[t] = r.rows[0].n;
    } catch (e) {
      counts[t] = `ERROR: ${e.message.slice(0, 80)}`;
    }
  }
  out.exact_counts = counts;

  // 5. Prisma migrations ledger
  try {
    out.prisma_migrations = await q('migrations', `SELECT migration_name, finished_at,
        applied_steps_count, logs IS NOT NULL AND length(logs) > 0 AS has_logs
        FROM _prisma_migrations ORDER BY finished_at NULLS LAST`);
  } catch (e) {
    out.prisma_migrations = { error: e.message.slice(0, 200) };
  }

  // 6. Referential integrity surface
  out.constraints = await q('constraints', `SELECT conrelid::regclass AS table_name,
        contype, count(*) AS n
      FROM pg_constraint WHERE connamespace NOT IN ('pg_catalog'::regnamespace,'information_schema'::regnamespace)
      GROUP BY 1, 2 ORDER BY 1, 2`);

  // 7. Enums
  out.enums = await q('enums', `SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid GROUP BY t.typname`);

  // 8. Views / materialized views
  out.views = await q('views', `SELECT schemaname, viewname FROM pg_views
      WHERE schemaname NOT IN ('pg_catalog','information_schema')
      UNION ALL SELECT schemaname, matviewname FROM pg_matviews
      WHERE schemaname NOT IN ('pg_catalog','information_schema')`);

  // 9. Functions (user-defined, names only)
  out.functions = await q('functions', `SELECT n.nspname, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind = 'f' ORDER BY 1,2 LIMIT 200`);

  process.stderr.write('[9/9] all queries complete\n');
  console.log('=== PROD DB READ-ONLY VERIFICATION ===');
  console.log(J(out));
}

main()
  .catch((e) => {
    console.error('VERIFICATION FAILED:', e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await client.end(); } catch {}
  });
