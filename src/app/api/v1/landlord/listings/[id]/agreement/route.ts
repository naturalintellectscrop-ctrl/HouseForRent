import { NextRequest, NextResponse } from 'next/server';
import { acceptAgreement, getListingForLister, effectiveCommissionRate } from '@/server/listings';
import { ApiError, readJson, requireRole, route } from '@/server/http';

/**
 * GET /api/v1/landlord/listings/:id/agreement - the terms as presented:
 * commission computed server-side, never a percentage the landlord does
 * arithmetic on. (Contract path; the landlord listing page reads it
 * in-process, the browser may fetch it directly.)
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  const { id } = await ctx.params;

  const mine = await getListingForLister(id, session.partyId);
  if (!mine) throw new ApiError(404, 'LISTING_NOT_FOUND', 'not your listing');

  const rate = await effectiveCommissionRate(new Date(), session.partyId);
  const commissionIfLet =
    (BigInt(mine.monthlyRent) * BigInt(rate.rateBpOfMonth)) / 10000n;

  return NextResponse.json({
    monthlyRent: mine.monthlyRent,
    commissionRateBp: rate.rateBpOfMonth,
    commissionIfLet: commissionIfLet.toString(),
    clause: {
      version: 'v1',
      heading: 'The circumvention clause',
      body:
        'If the tenant we introduced you to rents this home directly, without going through House For Rent, the full commission becomes payable. Our officers record every introduction with a timestamp and the parties present - that record is what makes this enforceable, and it is why we can keep tenants free and charge you only on success.',
    },
    payer: 'landlord',
    tenantPays: false,
    alreadyAccepted: mine.hasAcceptedAgreement,
    rateVersionId: rate.id,
  });
});

/** POST /api/v1/landlord/listings/:id/agreement - the landlord accepts the terms. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  await readJson(req);
  const { id } = await ctx.params;
  const agreement = await acceptAgreement({ listingId: id, listerPartyId: session.partyId });
  return NextResponse.json({ agreementId: agreement.id, acceptedAt: agreement.acceptedAt });
});
