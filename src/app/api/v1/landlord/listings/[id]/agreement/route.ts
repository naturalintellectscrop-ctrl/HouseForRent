import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { acceptAgreement } from '@/server/listings';
import { jsonError, readJson, requireRole, requireString, route } from '@/server/http';

/** POST /api/v1/landlord/listings/:id/agreement — the landlord accepts the terms. */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  try {
    const session = await requireRole(['lister']);
    await readJson(req);
    const { id } = await ctx.params;
    void requireString({ id }, 'id');
    const agreement = await acceptAgreement({ listingId: id, listerPartyId: session.partyId });
    void db;
    return NextResponse.json({ agreementId: agreement.id, acceptedAt: agreement.acceptedAt });
  } catch (err) {
    return jsonError(err);
  }
});
