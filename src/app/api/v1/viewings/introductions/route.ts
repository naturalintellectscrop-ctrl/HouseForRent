import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/viewings/introductions — introduction records as queryable
 * circumvention evidence (FR-5.3 / FR-8.3). Staff-only: exposing them to a
 * counterparty would tell a landlord which other tenants an officer
 * introduced. Optional query filters: tenantPartyId, landlordPartyId,
 * listingId — each must match in full.
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter, which routes a filtered call to the filtered resolver and keeps
 * one implementation of the shape.
 */
export const GET = route(async (req: NextRequest) => {
  await requireRole(['foo', 'admin']);
  return NextResponse.json(await api(`/v1/viewings/introductions${req.nextUrl.search}`));
});
