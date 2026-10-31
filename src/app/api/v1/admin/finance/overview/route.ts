import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route, jsonSafe } from '@/server/http';
import { financeOverview } from '@/server/finance/overview';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/finance/overview - the domain read-model for financial
 * administration, aggregated, honestly classified, straight from the ledger
 * and the lifecycle records. The aggregation lives in
 * `src/server/finance/overview.ts` so the ops console page and this
 * endpoint render the SAME numbers from the SAME code.
 */
export const GET = route(async (_req: NextRequest) => {
  await requireRole(['admin']);
  return NextResponse.json(jsonSafe(await financeOverview()));
});
