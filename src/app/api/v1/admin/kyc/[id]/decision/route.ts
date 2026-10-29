import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireString, route, readJson } from '@/server/http';
import { decideKycSection, KycSectionDecidedError, type KycDecision, type KycSection } from '@/server/kyc';

/**
 * POST /api/v1/admin/kyc/:id/decision — record one reviewer decision on one
 * section (identity | authority | payout). Admin-only, server-enforced.
 *
 * Idempotency where it matters: the SAME decision that is already current is
 * a 409 (no duplicate audit row); a different decision on a decided section
 * is the documented suspend/revoke path and is recorded as a NEW audit row.
 * A decision never auto-grants anything else: not account activation, not
 * field verification, not publication, not payout activation.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['admin']);
  const { id } = await ctx.params;
  const body = await readJson(req);

  const section = requireString(body, 'section') as KycSection;
  if (!['identity', 'authority', 'payout'].includes(section)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'section must be identity, authority or payout' } },
      { status: 400 },
    );
  }
  const decision = requireString(body, 'decision') as KycDecision;
  if (!['approve', 'request_info', 'reject'].includes(decision)) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'decision must be approve, request_info or reject' } },
      { status: 400 },
    );
  }
  const reason = requireString(body, 'reason');

  try {
    const updated = await decideKycSection({
      submissionId: id,
      adminPartyId: session.partyId,
      section,
      decision,
      reason,
    });
    return NextResponse.json({
      id: updated.id,
      identityState: updated.identityState,
      authorityState: updated.authorityState,
      payoutState: updated.payoutState,
    });
  } catch (err) {
    if (err instanceof KycSectionDecidedError) {
      return NextResponse.json(
        { error: { code: 'KYC_ALREADY_IN_STATE', message: err.message } },
        { status: 409 },
      );
    }
    throw err;
  }
});
