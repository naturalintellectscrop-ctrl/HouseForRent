#!/usr/bin/env node
/**
 * dev-local-stack — a STAY-ALIVE local database holder for interactive
 * browser development/verification (the missing piece between the one-shot
 * image-pipeline rig and the production Supabase).
 *
 * Boots PGlite (real Postgres 16 WASM) over the wire protocol on a FIXED
 * port, applies the schema generated from the current prisma/schema.prisma
 * (fresh data dir only), seeds the service-area neighbourhoods the property
 * form offers, and keeps running so `bun run dev` can point DATABASE_URL at
 * it. Media goes through MEDIA_STORAGE=local (the app refuses local storage
 * in production — this stack is dev-only by construction).
 *
 * Usage:
 *   bun scripts/dev-local-stack.mjs                 # foreground, Ctrl-C stops
 *   DATA_DIR=/tmp/hfr-localdev bun scripts/dev-local-stack.mjs
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO = '/home/z/my-project';
const PORT = Number(process.env.PORT_DB ?? 54321);
const DATA_DIR = process.env.DATA_DIR ?? '/tmp/hfr-localdev';

if (!process.env.DATABASE_URL_SENTINEL) {
  // Nothing to do — this process does not use Prisma itself.
}

mkdirSync(DATA_DIR, { recursive: true });
const fresh = !existsSync(path.join(DATA_DIR, 'pgdata'));

const db = new PGlite(path.join(DATA_DIR, 'pgdata'));
await db.waitReady;

if (fresh) {
  const DDL = execFileSync(
    'bunx',
    ['prisma', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { cwd: REPO, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgresql://x:x@127.0.0.1:9/x' } },
  );
  await db.exec(DDL);
  // Service-area neighbourhoods the property form's picker offers (the API
  // only lists in_service_area rows).
  const areas = [
    ['nbhd-kampala-central', 'Kampala Central'],
    ['nbhd-naalya', 'Naalya'],
    ['nbhd-kira', 'Kira'],
    ['nbhd-bukoto', 'Bukoto'],
    ['nbhd-ntinda', 'Ntinda'],
  ];
  for (const [id, name] of areas) {
    await db.query(`INSERT INTO neighbourhood (id, name, parent_id, in_service_area, created_at) VALUES ($1, $2, NULL, true, now()) ON CONFLICT (id) DO NOTHING`, [id, name]);
  }
  console.log(`dev-local-stack: fresh schema applied + ${areas.length} neighbourhoods seeded`);
} else {
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM neighbourhood`);
  console.log(`dev-local-stack: reusing existing data dir (neighbourhoods=${rows[0].n})`);
}

const server = new PGLiteSocketServer({ db, port: PORT, host: '127.0.0.1', maxConnections: 8 });
await server.start();
console.log(`dev-local-stack: listening on 127.0.0.1:${PORT} (data: ${DATA_DIR})`);
console.log(`dev-local-stack: point DATABASE_URL at postgres://dev:dev@127.0.0.1:${PORT}/postgres?pgbouncer=true&connection_limit=1&pool_timeout=60`);

const shutdown = async () => {
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
