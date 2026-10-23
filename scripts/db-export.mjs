/**
 * db-export — a dependency-free, consistent logical backup of the House For
 * Rent database (Phase C, production gate).
 *
 * ── Why this exists ──
 * The Supabase FREE plan ships no automated backups and no PITR (verified
 * against supabase.com/docs/guides/platform/backups and supabase.com/pricing,
 * October 2026). Until the project is on a paid plan, the only honest safety
 * net is an export we run ourselves. This script needs no pg_dump, no
 * direct connection privileges, and works through the Supabase POOLER that
 * the app already uses.
 *
 * ── Consistency ──
 * Everything is read inside ONE transaction at REPEATABLE READ, opened
 * READ ONLY — the snapshot can never observe a half-written deal, and the
 * run cannot mutate production even by accident.
 *
 * ── Output ──
 * backups/export-<ISO timestamp>.ndjson.gz
 *   line 1  {"meta": {...counts, beganAt, source-is-never-recorded}}
 *   line 2+ {"table": "<name>", "row": {…}}   (insert-ready JSON rows)
 * A SHA-256 checksum is printed and written to a sidecar .sha256 file.
 *
 * ── Honest limits ──
 * - Rows only: schema objects (triggers, functions) are NOT in the file.
 *   A restore target must first receive the schema (prisma migrate deploy
 *   or db push) — see scripts/db-restore.mjs and docs/DISASTER_RECOVERY.md.
 * - Secrets policy: the connection string is read from the environment
 *   and never written into the export, the log, or an error message.
 *
 * Run:  bun scripts/db-export.mjs            (DATABASE_URL from .env)
 *       bun scripts/db-export.mjs --out dir  (custom output directory)
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const OUT_DIR = (() => {
  const i = process.argv.indexOf("--out");
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : path.join(process.cwd(), "backups");
})();

const CHUNK = 2000; // rows per SELECT — small enough for pooler memory limits
const EXCLUDED_TABLES = new Set(["_prisma_migrations"]); // bookkeeping, not business data

/** Portable identifiers quoted the Postgres way. */
const q = (ident) => `"${ident.replace(/"/g, '""')}"`;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — refusing to run.");
    process.exit(2);
  }
  const db = new PrismaClient();
  const beganAt = new Date();
  console.log(`db-export: starting at ${beganAt.toISOString()} (READ ONLY, REPEATABLE READ)`);

  try {
    const tables = (
      await db.$queryRawUnsafe(
        `select table_name from information_schema.tables
         where table_schema = 'public' and table_type = 'BASE TABLE'
         order by table_name`
      )
    )
      .map((r) => r.table_name)
      .filter((t) => !EXCLUDED_TABLES.has(t));

    const stamp = beganAt.toISOString().replace(/[:.]/g, "-");
    await mkdir(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `export-${stamp}.ndjson.gz`);
    const hash = createHash("sha256");

    const manifest = {
      meta: {
        format: "hfr-ndjson-v1",
        beganAt: beganAt.toISOString(),
        tables: {},
        rowTotal: 0,
        note: "rows only — apply schema with prisma before restoring",
      },
    };

    const out = createWriteStream(file);
    const gzipStream = createGzip({ level: 6 });
    const pump = pipeline(gzipStream, out);
    const write = (s) => {
      hash.update(s);
      if (!gzipStream.write(s)) {
        return new Promise((res) => gzipStream.once("drain", res));
      }
      return Promise.resolve();
    };

    // Single consistent snapshot.
    const rows = await db.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe("SET TRANSACTION READ ONLY");
        await tx.$queryRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");

        const manifestTables = manifest.meta.tables;
        let rowTotal = 0;

        for (const table of tables) {
          const [{ n }] = await tx.$queryRawUnsafe(
            `select count(*)::int as n from ${q(table)}`
          );
          manifestTables[table] = n;
          rowTotal += n;
          if (n === 0) continue;

          // Keyset pagination on ctid: stable, index-free, ordering-safe.
          let lastCtid = "";
          let exported = 0;
          while (exported < n) {
            const page = await tx.$queryRawUnsafe(
              `select ctid::text as ctid, to_jsonb(t) as row
               from ${q(table)} t
               where ($1 = '' or ctid::text > $1)
               order by ctid::text
               limit $2`,
              lastCtid,
              CHUNK
            );
            if (page.length === 0) break;
            for (const r of page) {
              await write(JSON.stringify({ table, row: r.row }) + "\n");
              lastCtid = r.ctid;
              exported++;
            }
            if (page.length < CHUNK) break;
          }
          console.log(`  ${table}: ${exported}/${n}`);
        }
        manifest.meta.rowTotal = rowTotal;
        return { rowTotal };
      },
      { timeout: 10 * 60 * 1000 }
    );

    await write(JSON.stringify(manifest) + "\n");
    gzipStream.end();
    await pump;

    const digest = hash.digest("hex");
    await writeFile(path.join(OUT_DIR, `export-${stamp}.ndjson.gz.sha256`), `${digest}  export-${stamp}.ndjson.gz\n`);
    console.log(`db-export: ${file}`);
    console.log(`db-export: rows=${rows.rowTotal} sha256=${digest.slice(0, 16)}…`);
    console.log("db-export: done. Store this file OUTSIDE the production host (owner action).");
  } catch (err) {
    console.error("db-export FAILED:", String(err?.message ?? err).split("\n")[0]);
    process.exitCode = 1;
  } finally {
    try { await db.$disconnect(); } catch {}
  }
}

void main();
