import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route, jsonSafe } from '@/server/http';
import { financeOverview } from '@/server/finance/overview';
import {
  blockedPayouts,
  financeAuditTail,
  pendingMoneyDeals,
  refundRecordRows,
  unresolvedDuplicatePayments,
} from '@/server/finance/operations';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/finance/operations - the finance console's one read:
 * the overview figures PLUS the actual work queues - unresolved duplicate
 * payments, refund records with their real execution states, deals parked
 * on a money wait, payouts that are BLOCKED (with the reason), and the
 * financial audit tail. Every state shown is what the records say; nothing
 * here is synthesised success.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  const [overview, duplicates, refundRecords, pendingDeals, blocked, auditTail] = await Promise.all([
    financeOverview(),
    unresolvedDuplicatePayments(),
    refundRecordRows(),
    pendingMoneyDeals(),
    blockedPayouts(),
    financeAuditTail(),
  ]);
  return NextResponse.json(
    jsonSafe({
      overview,
      duplicates,
      refundRecords,
      pendingDeals,
      blockedPayouts: blocked,
      auditTail,
    }),
  );
});
