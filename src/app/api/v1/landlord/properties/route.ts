import { NextRequest, NextResponse } from 'next/server';
import { createPropertyWithListing } from '@/server/listings';
import { markListingAwaitingVerification } from '@/server/ops';
import { ApiError, parseShillings, readJson, requireRole, requireString, route } from '@/server/http';

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

  // Enum allowlists at the edge: an unknown propertyType or furnishing state
  // is the caller's mistake and must read as a 400 VALIDATION, not surface as
  // a Prisma validation 500 (the QA-round finding).
  const PROPERTY_TYPES: ReadonlySet<string> = new Set(['apartment', 'house', 'room', 'other']);
  const FURNISHED_STATES: ReadonlySet<string> = new Set(['furnished', 'semi_furnished', 'unfurnished']);
  const propertyType = requireString(body, 'propertyType');
  const furnished = requireString(body, 'furnished');
  if (!PROPERTY_TYPES.has(propertyType)) {
    throw new ApiError(400, 'VALIDATION', 'propertyType must be one of apartment, house, room, other');
  }
  if (!FURNISHED_STATES.has(furnished)) {
    throw new ApiError(400, 'VALIDATION', 'furnished must be one of furnished, semi_furnished, unfurnished');
  }

  const { listing } = await createPropertyWithListing({
    ownerPartyId: session.partyId,
    propertyType: propertyType as never,
    bedrooms,
    bathrooms,
    furnished,
    neighbourhoodId: requireString(body, 'neighbourhoodId'),
    landmarkText: requireString(body, 'landmarkText'),
    streetAddress: typeof body.streetAddress === 'string' && body.streetAddress.trim() ? body.streetAddress.trim() : undefined,
    monthlyRent: parseShillings(body.monthlyRent, 'monthlyRent'),
    requiredMonthsUpfront: months,
    depositAmount: parseShillings(body.depositAmount, 'depositAmount'),
    descriptionText: typeof body.descriptionText === 'string' && body.descriptionText.trim() ? body.descriptionText.trim() : undefined,
    advanceMutualAgreementRef:
      typeof body.advanceMutualAgreementRef === 'string' && body.advanceMutualAgreementRef.trim()
        ? body.advanceMutualAgreementRef.trim()
        : undefined,
  });

  await markListingAwaitingVerification(listing.id);
  return NextResponse.json({ listingId: listing.id, propertyId: listing.propertyId }, { status: 201 });
});
