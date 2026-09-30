import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/reconciliation - the latest ledger ↔ custodian check,
 * whether the ledger balances internally, and the recent history (FR-10.4).
 * Running a fresh check is a separate POST to /api/v1/ops/reconciliation -
 * a read never mutates the books.
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter behind the HTTP role gate.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/admin/reconciliation'));
});
