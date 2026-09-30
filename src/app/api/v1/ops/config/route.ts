import { NextRequest, NextResponse } from 'next/server';
import { listConfigParameters, listCommissionRateVersions } from '@/server/ops';
import { setConfigParameter } from '@/server/listings';
import { db } from '@/lib/db';
import { readJson, requireRole, requireString, route } from '@/server/http';

/** GET /api/v1/ops/config — parameters + effective-dated commission rates. */
export const GET = route(async () => {
  await requireRole(['admin']);
  const [parameters, rates] = await Promise.all([listConfigParameters(), listCommissionRateVersions()]);
  return NextResponse.json({ parameters, rates });
});

/**
 * POST /api/v1/ops/config — change a parameter. Append-only version history
 * records every change (who, when, what the value became).
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['admin']);
  const body = await readJson(req);

  const key = requireString(body, 'key');
  const value = requireString(body, 'value');

  if (key === 'commission_rate_bp') {
    // Commission rates are effective-dated, not overwritten (Decision 4).
    const bp = parseInt(value, 10);
    if (!Number.isInteger(bp) || bp <= 0 || bp > 10000) {
      throw new Error('commission rate must be between 1 and 10000 basis points');
    }
    const version = await db.commissionRateVersion.create({
      data: { rateBpOfMonth: bp, effectiveFrom: new Date(), createdByPartyId: session.partyId },
    });
    return NextResponse.json({ rateVersionId: version.id, rateBp: version.rateBpOfMonth }, { status: 201 });
  }

  const updated = await setConfigParameter({
    key,
    value,
    valueType: typeof body.valueType === 'string' ? body.valueType : 'text',
    createdByPartyId: session.partyId,
  });
  // The parameter row no longer carries a value — echo the value just
  // recorded on the new config version.
  return NextResponse.json({ key: updated.key, value });
});
