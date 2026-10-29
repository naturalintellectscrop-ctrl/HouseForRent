import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route, readJson } from '@/server/http';
import { resubmitLandlordKyc } from '@/server/kyc';

/**
 * PATCH /api/v1/landlord/kyc/:id — resubmit the caller's OPEN application.
 * Only the sections a reviewer sent back (more_info) — or that are still
 * pending — actually change state; decided sections keep their state and
 * their evidence. See src/server/kyc.ts (resubmitLandlordKyc) for the
 * merge + validation rules.
 */
export const PATCH = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  const { id } = await ctx.params;
  const body = await readJson(req);
  const updated = await resubmitLandlordKyc({
    partyId: session.partyId,
    submissionId: id,
    input: body as Parameters<typeof resubmitLandlordKyc>[0]['input'],
  });
  return NextResponse.json({
    id: updated.id,
    identityState: updated.identityState,
    authorityState: updated.authorityState,
    payoutState: updated.payoutState,
  });
});
