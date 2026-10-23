// Read-only production-state probe for the Phase A gate verification.
// Reports ONLY safe identifiers (project ref, region, counts, states).
// Never prints passwords, connection strings, or secrets.
import { PrismaClient } from "@prisma/client";

function projectIdentity(host) {
  const m = String(host).match(/([a-z0-9]{20})\.pooler\.supabase\.co/i);
  const regionMatch = String(host).match(/aws-0-([a-z0-9-]+)\.pooler/i);
  return { projectRef: m ? m[1] : null, region: regionMatch ? regionMatch[1] : null };
}

const url = process.env.DATABASE_URL || "";
let host = "unresolved";
try {
  host = new URL(url).hostname;
} catch {
  const after = String(url).split("@")[1];
  if (after) host = after.split("/")[0].split(":")[0];
}
const identity = projectIdentity(host);

const db = new PrismaClient();
const out = { probe: "phase-a-db", at: new Date().toISOString(), endpoint: identity };

async function count(db, t) {
  const rows = await db.$queryRawUnsafe(`select count(*)::int as n from "${t}"`);
  return rows[0].n;
}

async function main() {
  try {
    out.reachable = true;
    out.server = await db.$queryRawUnsafe("select current_database() as db, version() as ver");
    const tables = [
      "party", "user_account", "user_credential", "session", "property", "listing",
      "photo", "media_asset", "deal", "ledger_account", "ledger_entry", "psp_instruction",
      "viewing", "introduction_record", "neighbourhood", "audit_event",
      "config_parameter", "commission_rate_version",
    ];
    out.counts = {};
    for (const t of tables) {
      try {
        out.counts[t] = await count(db, t);
      } catch (e) {
        out.counts[t] = `ERROR: ${String(e.message).split("\n")[0].slice(0, 120)}`;
      }
    }
    out.migrations = (
      await db.$queryRawUnsafe(
        `select migration_name, finished_at is not null as applied from "_prisma_migrations" order by finished_at nulls last limit 30`
      )
    ).map((r) => `${r.migration_name}${r.applied ? "" : " (NOT APPLIED)"}`);
    const trig = await db.$queryRawUnsafe(
      `select tgrelid::regclass::text as tbl, tgname from pg_trigger where not tgisinternal and tgname = 'reject_mutation' order by 1`
    );
    out.appendOnlyTriggers = trig.map((t) => `${t.tbl}.${t.tgname}`);
    out.appendOnlyTriggerCount = trig.length;
  } catch (e) {
    out.reachable = false;
    out.errorCode = e?.code ?? null;
    out.errorMessage = String(e?.message ?? e).split("\n")[0].slice(0, 300);
  } finally {
    try {
      await db.$disconnect();
    } catch {}
    console.log(JSON.stringify(out, null, 2));
  }
}

main();
