// Applies all Prisma migrations in prisma/migrations/ to DATABASE_URL, in
// order, via a raw pg connection — bypassing `prisma migrate dev`/`deploy`,
// whose native schema-engine binary cannot complete its connection handshake
// against this project's local Postgres server (see DOMAIN.md, "Local
// database setup", for why). The Prisma Client itself (used everywhere else
// in the app and tests) connects fine via @prisma/adapter-pg.
//
// Usage: node test-infra/apply-migrations.mjs
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const client = new Client({ connectionString });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS _applied_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

for (const dir of dirs) {
  const { rows } = await client.query(
    'SELECT 1 FROM _applied_migrations WHERE name = $1',
    [dir],
  );
  if (rows.length > 0) {
    console.log(`skip (already applied): ${dir}`);
    continue;
  }
  const sqlPath = path.join(migrationsDir, dir, 'migration.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  console.log(`applying: ${dir}`);
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO _applied_migrations (name) VALUES ($1)', [dir]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

await client.end();
console.log('done');
