import { NextResponse } from 'next/server';
import { effectiveCommissionRate } from '@/server/listings';
import { route } from '@/server/http';

/**
 * GET /api/v1/commission-rate - the currently-effective rate version
 * (Decision 4: effective-dated). Public: it is what the landlord-facing
 * marketing pages quote, and the same version an agreement is drafted at.
 */
export const GET = route(async () => {
  const rate = await effectiveCommissionRate();
  return NextResponse.json({
    rateBpOfMonth: rate.rateBpOfMonth,
    effectiveFrom: rate.effectiveFrom.toISOString(),
  });
});
