import { NextRequest, NextResponse } from 'next/server';
import { setNeighbourhoodServiceArea } from '@/server/ops';
import { readJson, requireRole, route } from '@/server/http';

/**
 * POST /api/v1/ops/neighbourhoods/:neighbourhoodId/service-area - move the
 * service-area boundary for one neighbourhood.
 *
 * The flag is read LIVE by the public search filter, the publish gates and
 * the deal service, so this takes effect immediately (an area switched off
 * drops out of /properties and /areas; its live listings keep their state
 * but cannot be re-published while outside the area). A same-value call is
 * a no-op that records nothing; a real change writes `service_area_changed`
 * to the audit trail with from/to and how many live listings it affected.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ neighbourhoodId: string }> }) => {
  const session = await requireRole(['admin']);
  const { neighbourhoodId } = await ctx.params;
  const body = await readJson(req);
  const row = await setNeighbourhoodServiceArea({
    adminPartyId: session.partyId,
    neighbourhoodId,
    inServiceArea: body.inServiceArea === true,
  });
  return NextResponse.json(row);
});

export const dynamic = 'force-dynamic';
