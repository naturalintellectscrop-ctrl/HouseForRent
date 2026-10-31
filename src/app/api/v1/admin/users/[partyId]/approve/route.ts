import { NextRequest, NextResponse } from 'next/server';
import { approveAccountApplication } from '@/server/ops';
import { readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/admin/users/:partyId/approve - the platform activates an
 * account application.
 *
 * The decision rail mirrors rejection exactly: role-gated to `admin` at
 * the edge AND state-gated in the service (the party must still be
 * `pending_verification`), so a decision that raced another reviewer's
 * comes back 409 instead of overwriting history. The reviewer's identity
 * and moment are written to the account's audit trail; a short note is
 * optional but recommended - it is what a future reader asks for. No
 * other state changes: identity records stay as they are, nothing is
 * deleted, and approval activates the person only - never a property, a
 * listing or a staff privilege.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ partyId: string }> }) => {
  const session = await requireRole(['admin']);
  const { partyId } = await ctx.params;
  const body = await readJson(req);
  const note = typeof body.note === 'string' ? body.note : undefined;

  await approveAccountApplication({
    actorPartyId: session.partyId,
    partyId,
    note,
  });

  return NextResponse.json({ partyId, status: 'active', decision: 'approved' }, { status: 200 });
});

export const dynamic = 'force-dynamic';
