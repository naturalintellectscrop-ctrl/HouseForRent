/**
 * READ-ONLY production financial-state verification (Phase 2, task §1).
 *
 * Usage:
 *   PROD_DATABASE_URL='postgres://...' node scripts/verify-prod-finance-state.mjs
 *
 * Safety guarantees (same discipline as verify-prod-db.mjs):
 *   - Every statement is a hardcoded SELECT / catalog read.
 *   - Session forced READ-ONLY (SET default_transaction_read_only = on)
 *     with a statement timeout. No DDL, no DML, no writes of any kind.
 *   - Connection string is read from env; never logged.
 *
 * What it answers (Phase 2 report §1):
 *   1. Was 20261030120000_financial_architecture_foundation applied, and did
 *      it finish cleanly?
 *   2. Does the ACTUAL production schema match what the current
 *      prisma/schema.prisma expects (tables + columns + enums), i.e. is
 *      there drift the running Prisma client would trip over?
 *   3. What duplicate-payment / refund / reconciliation state already
 *      exists in production (counts only - no tenant data is printed)?
 */
import pg from 'pg';
import { readFileSync, readdirSync as readDirSync } from 'node:fs';

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

const J = (o) => JSON.stringify(o, null, 2);

/** The models this phase depends on, with the columns schema.prisma declares. */
function expectedFinanceTables() {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  // Parse @@map table names + their @map / bare SCALAR columns out of the
  // datamodel. Relation fields (type = another model / @relation / arrays)
  // are NOT columns and must not enter the comparison.
  const modelNames = new Set();
  const modelRe0 = /model\s+(\w+)\s+\{/g;
  let m0;
  while ((m0 = modelRe0.exec(schema)) !== null) modelNames.add(m0[1]);

  const models = {};
  const modelRe = /model\s+(\w+)\s+\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = modelRe.exec(schema)) !== null) {
    const body = m[2];
    const tableMap = body.match(/@@map\("([^"]+)"\)/);
    if (!tableMap) continue;
    const table = tableMap[1];
    const cols = new Set();
    const colRe = /^\s{2}(\w+)\s+(.+)$/gm;
    let c;
    while ((c = colRe.exec(body)) !== null) {
      const field = c[1];
      const rest = c[2];
      if (rest.startsWith('@relation')) continue;
      const baseType = rest.split(/[\s@]/)[0].replace(/\[\]$/, '').replace(/\?$/, '');
      if (modelNames.has(baseType)) continue; // relation field, not a column
      const lineStart = body.lastIndexOf('\n', c.index) + 1;
      const line = body.slice(lineStart, body.indexOf('\n', c.index));
      const mapMatch = line.match(/@map\("([^"]+)"\)/);
      cols.add(mapMatch ? mapMatch[1] : field.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`));
    }
    models[table] = cols;
  }
  return models;
}

async function main() {
  await client.connect();
  await client.query('SET default_transaction_read_only = on');
  await client.query('SET statement_timeout = 15000');

  const out = { safety: 'read-only session; SELECT statements only' };

  // 1. Migration ledger - was the finance foundation applied and finished?
  out.financeMigration = (
    await client.query(
      `SELECT migration_name, started_at, finished_at, applied_steps_count,
              logs IS NOT NULL AND length(logs) > 0 AS has_logs
         FROM _prisma_migrations
        WHERE migration_name LIKE '20261030%'
           OR migration_name LIKE '20261027%'
           OR migration_name LIKE '20261028%'
           OR migration_name LIKE '20261029%'
        ORDER BY migration_name`,
    )
  ).rows;
  out.allMigrations = (
    await client.query(`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY migration_name`)
  ).rows;

  // 2. Expected vs actual schema, for EVERY mapped table (drift = the
  //    columns the current Prisma client would select that do not exist).
  const expected = expectedFinanceTables();
  const actual = (
    await client.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' ORDER BY table_name, column_name`,
    )
  ).rows;
  const actualByTable = {};
  for (const r of actual) (actualByTable[r.table_name] ??= new Set()).add(r.column_name);

  const drift = {};
  for (const [table, cols] of Object.entries(expected)) {
    const have = actualByTable[table];
    if (!have) {
      drift[table] = { tableMissing: true };
      continue;
    }
    const missing = [...cols].filter((c) => !have.has(c));
    if (missing.length) drift[table] = { missingColumns: missing };
  }
  const financeCritical = [
    'deal', 'ledger_account', 'ledger_entry', 'psp_instruction',
    'psp_instruction_event', 'reconciliation_check', 'refund_record',
    'financial_adjustment', 'post_settlement_refund', 'move_in_verification',
    'deposit_case', 'deposit_deduction', 'audit_event',
  ];
  out.schemaDrift = {
    tablesCompared: Object.keys(expected).length,
    tablesWithDrift: Object.fromEntries(Object.entries(drift).filter(([t]) => financeCritical.includes(t))),
    otherDrift: Object.fromEntries(Object.entries(drift).filter(([t]) => !financeCritical.includes(t))),
  };

  // 3b. Repo migrations NOT recorded in production (drift the migration
  //     ledger makes explicit - includes the DRAFT index migration).
  const repoMigrations = [];
  try {
    for (const d of readDirSync('prisma/migrations')) {
      if (/^\d{14}_/.test(d)) repoMigrations.push(d);
    }
  } catch {}
  const appliedNames = new Set(out.allMigrations.map((r) => r.migration_name));
  out.unappliedRepoMigrations = repoMigrations.filter((m) => !appliedNames.has(m));
  out.financeEnums = (
    await client.query(
      `SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname IN ('DealStatus','PspInstructionState','PspInstructionKind',
                            'RefundKind','RefundState','FinancialAdjustmentKind',
                            'PostSettlementRefundState','LedgerAccountType',
                            'MoveInVerificationState','DepositCaseState','DepositDeductionState')
        GROUP BY t.typname ORDER BY t.typname`,
    )
  ).rows;

  // 4. Duplicate-payment / refund / reconciliation state (COUNTS only).
  out.duplicatePaymentState = {
    duplicateCollectAuditEvents: (
      await client.query(
        `SELECT count(*)::int AS n FROM audit_event WHERE event_type = 'psp_duplicate_collect_confirmation'`,
      )
    ).rows[0].n,
    amountMismatchAuditEvents: (
      await client.query(
        `SELECT count(*)::int AS n FROM audit_event WHERE event_type = 'psp_amount_mismatch'`,
      )
    ).rows[0].n,
    bookingFailedAuditEvents: (
      await client.query(
        `SELECT count(*)::int AS n FROM audit_event WHERE event_type = 'psp_booking_failed'`,
      )
    ).rows[0].n,
    duplicateRefundRecords: (
      await client.query(
        `SELECT state, count(*)::int AS n FROM refund_record WHERE kind = 'duplicate_payment' GROUP BY state`,
      )
    ).rows,
    refundRecordsByKindState: (
      await client.query(
        `SELECT kind, state, count(*)::int AS n FROM refund_record GROUP BY kind, state ORDER BY kind, state`,
      )
    ).rows,
    pspInstructionsByKind: (
      await client.query(
        `SELECT kind, count(*)::int AS n FROM psp_instruction GROUP BY kind`,
      )
    ).rows,
    pspInstructionEvents: (
      await client.query(
        `SELECT i.kind, e.to_state, count(*)::int AS n
           FROM psp_instruction_event e JOIN psp_instruction i ON i.id = e.instruction_id
          GROUP BY i.kind, e.to_state ORDER BY i.kind, e.to_state`,
      )
    ).rows,
    reconciliationChecks: (
      await client.query(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE is_reconciled)::int AS reconciled,
                max(run_at) AS last_run_at
           FROM reconciliation_check`,
      )
    ).rows[0],
    financialAdjustments: (
      await client.query(
        `SELECT kind, count(*)::int AS n FROM financial_adjustment GROUP BY kind`,
      )
    ).rows,
    ledgerPostingBalanceViolations: (
      await client.query(
        `SELECT count(*) AS n FROM (
            SELECT posting_id FROM ledger_entry
            GROUP BY posting_id
            HAVING sum(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) <> 0
         ) v`,
      )
    ).rows[0].n,
    dealStatusDistribution: (
      await client.query(`SELECT status, count(*)::int AS n FROM deal GROUP BY status ORDER BY status`)
    ).rows,
  };

  console.log('=== PROD FINANCE STATE (READ-ONLY) ===');
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
