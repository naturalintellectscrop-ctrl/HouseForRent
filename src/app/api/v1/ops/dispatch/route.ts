import { NextRequest, NextResponse } from 'next/server';
import { dispatchViewing } from '@/server/viewings';
import { parseDate, readJson, requireRole, requireString, route } from '@/server/http';

/** POST /api/v1/ops/dispatch — assign a viewing to a field officer. */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['admin']);
  const body = await readJson(req);
  const viewing = await dispatchViewing({
    viewingId: requireString(body, 'viewingId'),
    fooPartyId: requireString(body, 'fooPartyId'),
    scheduledFor: body.scheduledFor ? parseDate(body, 'scheduledFor') : new Date(),
  });
  return NextResponse.json({ id: viewing.id, status: viewing.status, officer: viewing.conductedByPartyId });
});
