import { NextRequest, NextResponse } from 'next/server';
import { createPropertyWithListing } from '@/server/listings';
import { markListingAwaitingVerification } from '@/server/ops';
import { parseShillings, readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/landlord/properties - the landlord authors the property and
 * its first listing terms (F-003). FOO verifies it later; publication stays
 * server-gated. The listing lands in `awaiting_verification` so it enters
 * the field queue by construction.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['lister']);
  const body = await readJson(req);

  const bedrooms = Number(body.bedrooms);
  const bathrooms = Number(body.bathrooms);
  const months = Number(body.requiredMonthsUpfront ?? 2);
  if (!Number.isInteger(bedrooms) || bedrooms < 0 || bedrooms > 20) {
    throw new Error('bedrooms must be a whole number between 0 and 20');
  }
  if (!Number.isInteger(bathrooms) || bathrooms < 0 || bathrooms > 20) {
    throw new Error('bathrooms must be a whole number between 0 and 20');
  }
  if (!Number.isInteger(months) || months < 1 || months > 24) {
    throw new Error('requiredMonthsUpfront must be between 1 and 24');
  }

  const { listing } = await createPropertyWithListing({
    ownerPartyId: session.partyId,
    propertyType: requireString(body, 'propertyType') as never,
    bedrooms,
    bathrooms,
    furnished: requireString(body, 'furnished'),
    neighbourhoodId: requireString(body, 'neighbourhoodId'),
    landmarkText: requireString(body, 'landmarkText'),
    streetAddress: typeof body.streetAddress === 'string' && body.streetAddress.trim() ? body.streetAddress.trim() : undefined,
    monthlyRent: parseShillings(body.monthlyRent, 'monthlyRent'),
    requiredMonthsUpfront: months,
    depositAmount: parseShillings(body.depositAmount, 'depositAmount'),
    descriptionText: typeof body.descriptionText === 'string' && body.descriptionText.trim() ? body.descriptionText.trim() : undefined,
  });

  await markListingAwaitingVerification(listing.id);
  return NextResponse.json({ listingId: listing.id, propertyId: listing.propertyId }, { status: 201 });
});
