import { NextRequest, NextResponse } from 'next/server';
import { rejectAccountApplication } from '@/server/ops';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/admin/users/:partyId/reject - the platform declines an
 * account application.
 *
 * ── The decision and its rails ──
 * Role-gated to `admin` at this edge AND state-gated inside the service
 * (the party must still be `pending_verification`): two admins deciding at
 * once produce exactly one rejection, and a decision that raced an
 * activation comes back 409 instead of overwriting history. The reason is
 * required, is written to the account's audit trail with the acting
 * admin's identity, and no other state changes: identity records stay as
 * they are (a failed check remains a true record), nothing is deleted, and
 * the affected account is refused at sign-in by the status policy every
 * consumer already trusts - no new permission vocabulary exists after
 * this route.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ partyId: string }> }) => {
  const session = await requireRole(['admin']);
  const { partyId } = await ctx.params;
  const body = await readJson(req);
  const reason = requireString(body, 'reason');

  await rejectAccountApplication({
    actorPartyId: session.partyId,
    partyId,
    reason,
  });

  return NextResponse.json({ partyId, status: 'suspended', decision: 'rejected' }, { status: 200 });
});

export const dynamic = 'force-dynamic';
