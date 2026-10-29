import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireString, route } from '@/server/http';
import { acceptLandlordTerms, getLandlordTermsStatus } from '@/server/kyc';
import { readJson } from '@/server/http';

/**
 * GET /api/v1/landlord/terms — the current onboarding-terms version and the
 * caller's acceptance record (current + full append-only history).
 *
 * POST /api/v1/landlord/terms/accept? No — POST here with { version }.
 * Acceptance is EXPLICIT and versioned: the body must name exactly the
 * version the server currently offers, and the server — not a checkbox —
 * writes the ConsentRecord. Re-accepting the same version returns the
 * existing record (idempotent); a new version writes a NEW append-only row
 * and never rewrites the historical one.
 */
export const GET = route(async () => {
  const session = await requireRole(['lister', 'admin']);
  return NextResponse.json(await getLandlordTermsStatus(session.partyId));
});

export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['lister']);
  const body = await readJson(req);
  const version = requireString(body, 'version');
  return NextResponse.json(await acceptLandlordTerms({ partyId: session.partyId, version }));
});
