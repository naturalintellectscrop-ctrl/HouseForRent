import { NextRequest, NextResponse } from 'next/server';
import { createServiceAreaNeighbourhood, adminNeighbourhoodDirectory } from '@/server/ops';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * GET /api/v1/ops/neighbourhoods - every neighbourhood with its usage
 * counts (properties, live listings), for the service-area console.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json({ neighbourhoods: await adminNeighbourhoodDirectory() });
});

/**
 * POST /api/v1/ops/neighbourhoods - create a neighbourhood (F-015).
 *
 * First reachable HTTP for a path the contract always promised: the body
 * is name + district (+ optional inServiceArea), duplicates are a 409
 * NEIGHBOURHOOD_EXISTS rather than a silent second row, and the creation
 * is audited. The public taxonomy endpoints keep reading the same table,
 * so a new area appears in search and on /areas the moment it exists.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['admin']);
  const body = await readJson(req);
  const row = await createServiceAreaNeighbourhood({
    adminPartyId: session.partyId,
    name: requireString(body, 'name'),
    district: requireString(body, 'district'),
    inServiceArea: body.inServiceArea === true,
  });
  return NextResponse.json(row, { status: 201 });
});

export const dynamic = 'force-dynamic';
