/**
 * db-restore — restore a db-export NDJSON backup into a RECOVERY database,
 * never into production (Phase C, production gate).
 *
 * ── Safety rails ──
 * - Requires RESTORE_DATABASE_URL (the recovery target) to be set and
 *   DIFFERENT from DATABASE_URL — a same-URL run is refused outright.
 * - Requires both --yes and ALLOW_DB_RESTORE=yes, mirroring the purge
 *   tool's two-key convention.
 * - Refuses a target that already contains rows (a recovery database is
 *   created empty, receives the schema via prisma, then fills once).
 *
 * ── Precondition ──
 * The target must already carry the schema (run `prisma migrate deploy` or
 * `bun run db:push` against RESTORE_DATABASE_URL first) — the export holds
 * rows only, and this script refuses to fabricate a schema.
 *
 * ── Integrity gates after load ──
 * - per-table row counts must match the export manifest exactly;
 * - the ledger must balance: Σ(debit) == Σ(credit) across ledger_entry.
 *
 * Run:
 *   RESTORE_DATABASE_URL=postgres://… ALLOW_DB_RESTORE=yes \
 *     bun scripts/db-restore.mjs --file backups/export-….ndjson.gz --yes
 */
import { PrismaClient } from "@prisma/client";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import path from "node:path";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : null;
};

const q = (ident) => `"${ident.replace(/"/g, '""')}"`;

async function readExport(file) {
  const rl = readline.createInterface({
    input: createReadStream(file).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  const tables = new Map(); // name -> rows[]
  let manifest = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    if (obj.meta) {
      manifest = obj.meta;
      continue;
    }
    if (!tables.has(obj.table)) tables.set(obj.table, []);
    tables.get(obj.table).push(obj.row);
  }
  return { manifest, tables };
}

async function main() {
  if (process.env.ALLOW_DB_RESTORE !== "yes" || !args.includes("--yes")) {
    console.error(
      "db-restore: refusing to run. This tool writes a database. Provide ALLOW_DB_RESTORE=yes and --yes after you have confirmed the target is a recovery database."
    );
    process.exit(2);
  }
  const file = getArg("--file");
  if (!file) {
    console.error("db-restore: --file <export.ndjson.gz> is required");
    process.exit(2);
  }
  if (!process.env.RESTORE_DATABASE_URL) {
    console.error("db-restore: RESTORE_DATABASE_URL (the recovery target) is required");
    process.exit(2);
  }
  if (process.env.RESTORE_DATABASE_URL === process.env.DATABASE_URL) {
    console.error("db-restore: RESTORE_DATABASE_URL equals DATABASE_URL — refusing to overwrite the source.");
    process.exit(2);
  }

  console.log("db-restore: reading export…");
  const { manifest, tables } = await readExport(path.resolve(file));
  if (!manifest) {
    console.error("db-restore: export file has no manifest — not a db-export file.");
    process.exit(2);
  }
  console.log(
    `db-restore: manifest rowTotal=${manifest.rowTotal}, tables=${Object.keys(manifest.tables).length}, beganAt=${manifest.beganAt}`
  );

  const db = new PrismaClient({
    datasources: { db: { url: process.env.RESTORE_DATABASE_URL } },
  });

  try {
    // 1. The target schema must already exist and be complete — checked
    // against the FULL manifest (including 0-row tables). A target missing a
    // manifest table would otherwise pass the load and then crash later with
    // a raw 42P01 in the count verification (found by the first real-data
    // recovery drill: production's out-of-band tables are in the manifest).
    const existing = new Set(
      (
        await db.$queryRawUnsafe(
          `select table_name from information_schema.tables
           where table_schema='public' and table_type='BASE TABLE'`
        )
      ).map((r) => r.table_name)
    );
    const manifestTables = new Set(Object.keys(manifest.tables));
    const missing = [...manifestTables].filter((t) => !existing.has(t));
    if (missing.length > 0) {
      console.error(
        `db-restore: target is missing tables present in the export manifest: ${missing.join(", ")}. Apply the complete schema first (prisma schema + scripts/recovery-out-of-band-tables.sql for the out-of-band tables).`
      );
      process.exit(2);
    }

    // 2. The target must be empty (checked over the full manifest set).
    for (const t of manifestTables) {
      const [{ n }] = await db.$queryRawUnsafe(`select count(*)::int as n from ${q(t)}`);
      if (n > 0) {
        console.error(`db-restore: target table ${t} already has ${n} rows — refusing a non-empty recovery database.`);
        process.exit(2);
      }
    }

    // 3. Parents before children, from the target's own FK catalogue.
    // Self-references (e.g. neighbourhood.parent_id → neighbourhood) are NOT
    // cycles: they load in dependency passes (found by the recovery drill -
    // real production neighbourhoods carry a district parent).
    const edges = await db.$queryRawUnsafe(
      `select conrelid::regclass::text as child, confrelid::regclass::text as parent
       from pg_constraint where contype='f' and connamespace='public'::regnamespace`
    );
    const selfRefTables = new Set(
      edges.filter((e) => e.child === e.parent && tables.has(e.child)).map((e) => e.child),
    );
    const order = [];
    const state = new Map(); // 0=unvisited 1=visiting 2=done
    const visit = (t, stack = new Set()) => {
      const s = state.get(t) ?? 0;
      if (s === 2) return;
      if (s === 1 || stack.has(t)) throw new Error(`FK cycle at ${t} — restore aborted`);
      stack.add(t);
      state.set(t, 1);
      for (const e of edges) {
        if (e.child === t && e.parent !== t && tables.has(e.parent)) visit(e.parent, stack);
      }
      stack.delete(t);
      state.set(t, 2);
      order.push(t);
    };
    for (const t of tables.keys()) visit(t);

    // 4. Load.
    const CHUNK = 500;
    let loaded = 0;
    /** Loads a self-referencing table in dependency passes: each pass inserts
     * every row whose (already-loaded) parents are all present; a failed
     * chunk falls back to row-by-row so one unordered row cannot strand its
     * neighbours. Aborts only when a full pass loads nothing. */
    const loadSelfRef = async (t, rows) => {
      let pending = [...rows];
      let done = 0;
      for (let pass = 0; pending.length > 0; pass++) {
        const remaining = [];
        for (let i = 0; i < pending.length; i += CHUNK) {
          const chunk = pending.slice(i, i + CHUNK);
          try {
            await db.$executeRawUnsafe(buildInsert(t, chunk));
            done += chunk.length;
          } catch {
            for (const row of chunk) {
              try {
                await db.$executeRawUnsafe(buildInsert(t, [row]));
                done += 1;
              } catch {
                remaining.push(row);
              }
            }
          }
        }
        if (pending.length === remaining.length) {
          throw new Error(`cannot order self-referencing rows in ${t} (circular parents?) — restore aborted`);
        }
        pending = remaining;
        if (pass > rows.length) throw new Error(`self-reference passes diverged in ${t} — restore aborted`);
      }
      return done;
    };
    for (const t of order) {
      const rows = tables.get(t);
      if (selfRefTables.has(t)) {
        loaded += await loadSelfRef(t, rows);
      } else {
        for (let i = 0; i < rows.length; i += CHUNK) {
          await db.$executeRawUnsafe(buildInsert(t, rows.slice(i, i + CHUNK)));
        }
        loaded += rows.length;
      }
      console.log(`  ${t}: ${rows.length}`);
    }

    // 5. Verify counts against the manifest.
    let mismatches = 0;
    for (const [t, expected] of Object.entries(manifest.tables)) {
      const [{ n }] = await db.$queryRawUnsafe(`select count(*)::int as n from ${q(t)}`);
      if (n !== expected) {
        console.error(`db-restore: COUNT MISMATCH ${t}: restored=${n} expected=${expected}`);
        mismatches++;
      }
    }

    // 6. Ledger must balance.
    const bal = await db.$queryRawUnsafe(
      `select
         coalesce(sum(case when direction='debit' then amount else 0 end),0) as debits,
         coalesce(sum(case when direction='credit' then amount else 0 end),0) as credits
       from ledger_entry`
    );
    const b = bal[0];
    const balanced = BigInt(b.debits) === BigInt(b.credits);

    console.log(`db-restore: loaded ${loaded} rows in ${order.length} tables`);
    console.log(`db-restore: manifest counts ${mismatches === 0 ? "MATCH" : `MISMATCHED (${mismatches})`}`);
    console.log(
      `db-restore: ledger ${balanced ? "BALANCED" : `UNBALANCED (debits=${b.debits}, credits=${b.credits})`} — deal/escrow records must reconcile before the recovery DB is trusted.`
    );
    if (mismatches > 0 || !balanced) process.exitCode = 1;
    else console.log("db-restore: restore verified. Test application connectivity against this database before any cutover.");
  } finally {
    try {
      await db.$disconnect();
    } catch {}
  }
}

/** Builds one parameter-light multi-row INSERT (values inlined, safely quoted). */
function buildInsert(table, rows) {
  const cols = Object.keys(rows[0]).filter((c) => c !== undefined);
  const lit = (v) => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number" || typeof v === "bigint") return v.toString();
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})?$/.test(v) || /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) {
      return `'${String(v).replace(/'/g, "''")}'::timestamptz`;
    }
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const values = rows
    .map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`)
    .join(",\n  ");
  return `insert into ${q(table)} (${cols.map(q).join(", ")}) values\n  ${values}`;
}

void main();
