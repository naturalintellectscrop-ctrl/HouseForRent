import { NextRequest, NextResponse } from 'next/server';
import { dispatchViewing } from '@/server/viewings';
import { parseDate, readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/ops/dispatch - assign (or reassign) a field officer.
 *
 * Absent `scheduledFor` means KEEP the slot the tenant proposed - the
 * backend used to default it to `new Date()`, silently stomping the
 * proposal the form promised to keep. The service now owns that rule and
 * additionally refuses any party that is not an active field officer, and
 * writes the `viewing_assigned` audit row (with reassigned/previous-officer
 * detail) in the same transaction as the move.
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['admin']);
  const body = await readJson(req);
  const result = await dispatchViewing({
    viewingId: requireString(body, 'viewingId'),
    adminPartyId: session.partyId,
    fooPartyId: requireString(body, 'fooPartyId'),
    ...(body.scheduledFor ? { scheduledFor: parseDate(body, 'scheduledFor') } : {}),
  });
  return NextResponse.json({
    id: result.viewing.id,
    status: result.viewing.status,
    officer: result.viewing.conductedByPartyId,
    changed: result.changed,
  });
});
