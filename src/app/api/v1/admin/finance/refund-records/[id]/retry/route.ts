import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route } from '@/server/http';
import { retryRefundRecord } from '@/server/finance/refunds';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/admin/finance/refund-records/:id/retry - retry a FAILED
 * refund record under a fresh, attempt-suffixed idempotency key.
 *
 * Only FAILED records are retryable: a PENDING record has an unanswered
 * provider instruction, and a second instruction would risk a double
 * payout; a CONFIRMED record already moved its money. The completion still
 * requires provider confirmation - the retry only re-arms the instruction.
 */
export const POST = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['admin']);
  const { id } = await ctx.params;
  const result = await retryRefundRecord({ recordId: id, actorPartyId: session.partyId });
  return NextResponse.json(result);
});
