import { NextRequest, NextResponse } from 'next/server';
import { findForTenant, requestViewing } from '@/server/viewings';
import { parseDate, readJson, requireRole, requireString, route } from '@/server/http';

/** GET /api/v1/viewings — the tenant's own viewing list. */
export const GET = route(async () => {
  const session = await requireRole(['tenant']);
  return NextResponse.json(await findForTenant(session.partyId));
});

/**
 * POST /api/v1/viewings — a tenant requests a viewing.
 * Identity verification is the universal baseline (Decision 10): an
 * unverified tenant is refused with TENANT_NOT_VERIFIED, not silently
 * allowed.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['tenant']);
  const body = await readJson(req);
  const viewing = await requestViewing({
    listingId: requireString(body, 'listingId'),
    tenantPartyId: session.partyId,
    scheduledFor: parseDate(body, 'preferredDate'),
  });
  return NextResponse.json({ id: viewing.id, status: viewing.status }, { status: 201 });
});
