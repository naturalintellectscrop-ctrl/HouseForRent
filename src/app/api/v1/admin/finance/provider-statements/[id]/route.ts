import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route } from '@/server/http';
import { providerStatementDetail } from '@/server/finance/provider-statement';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/finance/provider-statements/:id - one statement's
 * preserved lines, verdicts, the live "missing instruction" side and the
 * two SEPARATE balances (provider-reported vs internal-for-matched).
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole(['admin']);
  const { id } = await ctx.params;
  return NextResponse.json(await providerStatementDetail(id));
});
