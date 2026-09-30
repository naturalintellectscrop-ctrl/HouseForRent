import { NextRequest, NextResponse } from 'next/server';
import { findMandatesForLister, submitMandate } from '@/server/mandates';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * GET /api/v1/landlord/mandates - the signed-in lister's mandates, newest
 * first. A mandate is only ever read by the account that submitted it.
 */
export const GET = route(async () => {
  const session = await requireRole(['lister']);
  return NextResponse.json(await findMandatesForLister(session.partyId));
});

/**
 * POST /api/v1/landlord/mandates - submit (or, after a rejection, submit
 * again) the mandate for one property: the owner's written authority for
 * us to market it. 201 with the mandate; a pending or already-verified
 * mandate returns the same row unchanged (still 201 - the submission was
 * processed, it was just already on file).
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['lister']);
  const body = await readJson(req);
  const note = requireString(body, 'note', { optional: true });

  const mandate = await submitMandate({
    propertyId: requireString(body, 'propertyId'),
    listerPartyId: session.partyId,
    note: note || undefined,
  });

  return NextResponse.json(
    { id: mandate.id, state: mandate.state, propertyId: mandate.propertyId },
    { status: 201 },
  );
});

export const dynamic = 'force-dynamic';
