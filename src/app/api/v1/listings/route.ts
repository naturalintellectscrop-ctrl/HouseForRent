import { NextRequest, NextResponse } from 'next/server';
import { publicSearch, type SearchFilters } from '@/server/listings';
import { ApiError, route } from '@/server/http';

/** GET /api/v1/listings - the corridor-scoped public feed. */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const filters: SearchFilters = {};
  const ids = sp.get('neighbourhoodIds');
  if (ids) filters.neighbourhoodIds = ids.split(',').filter(Boolean);
  const minRent = sp.get('minRent');
  if (minRent) {
    if (!/^[0-9]+$/.test(minRent)) throw new ApiError(400, 'VALIDATION', 'minRent must be a whole number');
    filters.minRent = BigInt(minRent);
  }
  const maxRent = sp.get('maxRent');
  if (maxRent) {
    if (!/^[0-9]+$/.test(maxRent)) throw new ApiError(400, 'VALIDATION', 'maxRent must be a whole number');
    filters.maxRent = BigInt(maxRent);
  }
  const bedrooms = sp.get('bedrooms');
  if (bedrooms) {
    if (!/^[0-9]+$/.test(bedrooms)) throw new ApiError(400, 'VALIDATION', 'bedrooms must be a number');
    filters.bedrooms = parseInt(bedrooms, 10);
  }
  const furnished = sp.get('furnished');
  if (furnished) filters.furnished = furnished;
  const propertyType = sp.get('propertyType');
  if (propertyType) filters.propertyType = propertyType as never;
  const q = sp.get('q');
  if (q) filters.q = q;
  const sort = sp.get('sort');
  if (sort && ['fresh', 'rent_asc', 'rent_desc', 'newest'].includes(sort)) {
    filters.sort = sort as SearchFilters['sort'];
  }
  const offset = sp.get('offset');
  if (offset) filters.offset = Math.max(0, parseInt(offset, 10) || 0);

  const response = await publicSearch(filters);
  return NextResponse.json(response);
});
