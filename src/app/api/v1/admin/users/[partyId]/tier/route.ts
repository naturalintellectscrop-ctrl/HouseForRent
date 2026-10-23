import { NextRequest, NextResponse } from 'next/server';
import { setListerTier } from '@/server/ops';
import { LISTER_TIERS } from '@/server/domain';
import { ApiError, readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/admin/users/:partyId/tier - operations sets a landlord
 * account's listing tier.
 *
 * The tier is what gates the mandate requirement, so it is never
 * self-declared at signup: this endpoint is admin-only, the service
 * refuses non-lister accounts (422 TIER_NOT_APPLICABLE), an unchanged
 * value is a no-op that records nothing, and every real change writes
 * `lister_tier_changed` to the audit trail with the previous value.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ partyId: string }> }) => {
  const session = await requireRole(['admin']);
  const { partyId } = await ctx.params;
  const body = await readJson(req);
  const tier = requireString(body, 'tier');
  if (!(LISTER_TIERS as readonly string[]).includes(tier)) {
    throw new ApiError(
      422,
      'VALIDATION',
      `"${tier}" is not a listing tier. Use one of: ${LISTER_TIERS.join(', ')}.`,
    );
  }

  const result = await setListerTier({
    adminPartyId: session.partyId,
    partyId,
    tier,
  });

  return NextResponse.json(result);
});

export const dynamic = 'force-dynamic';
