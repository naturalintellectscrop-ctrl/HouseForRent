import { NextRequest, NextResponse } from 'next/server';
import { decideMandate } from '@/server/mandates';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/admin/mandates/:id/decision - operations decides a pending
 * mandate: `verified` (the owner's authority checks out) or `rejected`
 * (it does not). The optional note is written to the AUDIT trail, not the
 * mandate row. Only a pending mandate can be decided - a second decision
 * is a 409, and a rejected mandate re-enters the queue only through the
 * lister submitting it again.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['admin']);
  const { id } = await ctx.params;
  const body = await readJson(req);
  const note = requireString(body, 'note', { optional: true });

  const mandate = await decideMandate({
    mandateId: id,
    adminPartyId: session.partyId,
    decision: requireString(body, 'decision') as 'verified' | 'rejected',
    note: note || undefined,
  });

  return NextResponse.json({
    id: mandate.id,
    state: mandate.state,
    // The decision time is verified_at on the production row; the wire key
    // stays `decidedAt` so the console's contract is unchanged.
    decidedAt: mandate.verifiedAt?.toISOString() ?? null,
  });
});

export const dynamic = 'force-dynamic';
