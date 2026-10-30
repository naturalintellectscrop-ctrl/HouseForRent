import { NextRequest, NextResponse } from 'next/server';
import { amendListing } from '@/server/listings';
import { parseShillings, readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/landlord/listings/:id/amend - the landlord corrects their own
 * UNPUBLISHED listing (details and/or terms). The rules live in
 * `amendListing` (src/server/listings.ts): owner-only, withdraw-first for a
 * live listing, and a PHYSICAL change (rooms, type, furnishing, location)
 * re-opens field verification — the officer's verdict named a different
 * home, so the publish gate re-arms and the queue sees it again. A
 * terms-only change (rent, deposit, upfront months, copy) keeps the verdict.
 *
 * Every applied change is audited as `listing_amended` with the exact
 * changed-field list, so the trail answers "who changed the rent, when".
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requireRole(['lister']);
  const body = await readJson(req);
  const { id } = await ctx.params;

  const bedrooms = body.bedrooms !== undefined ? Number(body.bedrooms) : undefined;
  const bathrooms = body.bathrooms !== undefined ? Number(body.bathrooms) : undefined;
  const months = body.requiredMonthsUpfront !== undefined ? Number(body.requiredMonthsUpfront) : undefined;

  const result = await amendListing({
    listingId: id,
    listerPartyId: session.partyId,
    propertyType: typeof body.propertyType === 'string' && body.propertyType ? body.propertyType : undefined,
    bedrooms,
    bathrooms,
    furnished: typeof body.furnished === 'string' && body.furnished ? body.furnished : undefined,
    neighbourhoodId: typeof body.neighbourhoodId === 'string' && body.neighbourhoodId ? body.neighbourhoodId : undefined,
    landmarkText: typeof body.landmarkText === 'string' && body.landmarkText.trim() ? body.landmarkText.trim() : undefined,
    streetAddress:
      body.streetAddress === null
        ? null
        : typeof body.streetAddress === 'string' && body.streetAddress.trim()
          ? body.streetAddress.trim()
          : undefined,
    monthlyRent: body.monthlyRent !== undefined ? parseShillings(body.monthlyRent, 'monthlyRent') : undefined,
    depositAmount: body.depositAmount !== undefined ? parseShillings(body.depositAmount, 'depositAmount') : undefined,
    requiredMonthsUpfront: months,
    advanceMutualAgreementRef:
      body.advanceMutualAgreementRef !== undefined &&
      typeof body.advanceMutualAgreementRef === 'string' &&
      body.advanceMutualAgreementRef.trim()
        ? body.advanceMutualAgreementRef.trim()
        : undefined,
    descriptionText:
      body.descriptionText === null
        ? null
        : typeof body.descriptionText === 'string' && body.descriptionText.trim()
          ? body.descriptionText.trim()
          : undefined,
  });

  return NextResponse.json(result, { status: 200 });
});
