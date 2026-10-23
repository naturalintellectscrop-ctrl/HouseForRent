import { NextRequest, NextResponse } from 'next/server';
import { recentReconciliationChecks, runReconciliation } from '@/server/ops';
import { readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/ops/reconciliation - run the ledger-vs-PSP assertions.
 * Records the result; a `false` is REPORTED, never hidden (a non-reconciled
 * state is a real condition an operator must see).
 */
export const POST = route(async (req: NextRequest) => {
  await requireRole(['admin']);
  await readJson(req);
  const check = await runReconciliation();
  return NextResponse.json(
    {
      id: check.id,
      ledgerBalance: check.ledgerBalance.toString(),
      pspBalance: check.pspBalance.toString(),
      isReconciled: check.isReconciled,
      runAt: check.runAt,
    },
    { status: 201 },
  );
});

/** GET - recent check history. */
export const GET = route(async () => {
  await requireRole(['admin']);
  const checks = await recentReconciliationChecks();
  return NextResponse.json(
    checks.map((c) => ({
      id: c.id,
      runAt: c.runAt,
      ledgerBalance: c.ledgerBalance.toString(),
      pspBalance: c.pspBalance.toString(),
      isReconciled: c.isReconciled,
    })),
  );
});
