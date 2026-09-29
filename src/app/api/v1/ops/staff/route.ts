import { NextRequest, NextResponse } from 'next/server';
import { provisionStaff } from '@/server/ops';
import { hashPassword } from '@/server/auth';
import { db } from '@/lib/db';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/ops/staff — an admin provisions a field officer or admin.
 * Staff are never self-served (roles table: only tenant/lister self-serve).
 */
export const POST = route(async (req: NextRequest) => {
  const session = await requireRole(['admin']);
  const body = await readJson(req);
  const { account } = await provisionStaff({
    actorPartyId: session.partyId,
    displayName: requireString(body, 'displayName'),
    primaryPhone: requireString(body, 'primaryPhone'),
    password: requireString(body, 'password'),
    role: requireString(body, 'role') as never,
  });
  await hashPassword; // (hashed inside provisionStaff via dynamic import)
  return NextResponse.json({ accountId: account.id }, { status: 201 });
});

/** GET /api/v1/ops/staff — the staff roster. */
export const GET = route(async () => {
  await requireRole(['admin']);
  const accounts = await db.userAccount.findMany({
    where: { role: { in: ['foo', 'admin'] } },
    include: { party: { select: { displayName: true, primaryPhone: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(
    accounts.map((a) => ({
      id: a.id,
      role: a.role,
      displayName: a.party.displayName,
      primaryPhone: a.party.primaryPhone,
    })),
  );
});
