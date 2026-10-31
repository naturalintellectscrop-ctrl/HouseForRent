import { NextRequest, NextResponse } from 'next/server';
import { ApiError, readJson, requireRole, route } from '@/server/http';
import { setStaffAccess } from '@/server/ops';

/**
 * POST /api/v1/ops/staff/:partyId/access - suspend or restore a staff
 * account's platform access.
 *
 * The rails: admin-only; staff accounts only (tenants and listers have
 * their own lifecycle); self-access changes refused (a sole owner cannot
 * lock themself out); the last active administrator cannot be suspended;
 * the status move is conditional so two concurrent decisions produce one
 * winner; suspension revokes live sessions immediately; and every change
 * lands on the audit trail with the acting admin's identity.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ partyId: string }> }) => {
  const session = await requireRole(['admin']);
  const { partyId } = await ctx.params;
  const body = await readJson(req);
  const action = body.action;
  if (action !== 'suspend' && action !== 'restore') {
    throw new ApiError(422, 'VALIDATION', 'action must be suspend or restore');
  }
  const result = await setStaffAccess({ actorPartyId: session.partyId, partyId, action });
  return NextResponse.json({ partyId, ...result });
});

export const dynamic = 'force-dynamic';
