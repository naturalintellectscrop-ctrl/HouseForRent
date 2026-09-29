import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { IDENTITY_PROVIDER_IS_MOCK, submitIdentityVerification } from '@/server/ops';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/identity — submit an identity check.
 * THE IDENTITY PROVIDER IS A MOCK (structural NIN validation + a name
 * match). Every surface that calls this must say so. V1 collects no
 * payslips, no bank statements — identity only (Decision 10).
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['tenant', 'lister']);
  const body = await readJson(req);

  const method = requireString(body, 'method');
  const nin = requireString(body, 'nin');
  const fullName = requireString(body, 'fullName');
  void IDENTITY_PROVIDER_IS_MOCK;

  const record = await submitIdentityVerification({
    partyId: session.partyId,
    displayName: session.displayName,
    method,
    nin,
    fullName,
  });

  return NextResponse.json(
    { id: record.id, state: record.state, provider: 'sandbox-mock' },
    { status: 201 },
  );
});

/** GET — the caller's verification state. */
export const GET = route(async () => {
  const session = await requireRole(['tenant', 'lister']);
  const records = await db.identityVerification.findMany({
    where: { partyId: session.partyId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({
    verificationState: session.verificationState ?? 'unverified',
    records: records.map((r) => ({ id: r.id, method: r.method, state: r.state, createdAt: r.createdAt })),
    provider: 'sandbox-mock',
  });
});
