import { NextRequest, NextResponse } from 'next/server';
import { createFromIntroduction, findForParty } from '@/server/deals';
import { readJson, requireRole, requireString, route } from '@/server/http';

/** GET /api/v1/deals - every deal the caller is a party to. */
export const GET = route(async () => {
  const session = await requireRole(['tenant', 'lister', 'admin', 'foo']);
  return NextResponse.json(await findForParty(session.partyId));
});

/**
 * POST /api/v1/deals - create a deal FROM AN INTRODUCTION RECORD (FR-8.3).
 * The body has no field that could name a person: tenant, landlord, listing
 * are all derived server-side from the record.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['foo', 'admin']);
  const body = await readJson(req);
  const deal = await createFromIntroduction({
    introductionRecordId: requireString(body, 'introductionRecordId'),
    actorPartyId: session.partyId,
    actorRole: session.role,
  });
  return NextResponse.json({ id: deal.id, status: deal.status }, { status: 201 });
});
