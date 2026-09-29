import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { issueSession, resolveSession, homeFor, verifyPassword, maySignIn } from '@/server/auth';
import { ApiError, readJson, requireString, route } from '@/server/http';

/**
 * POST /api/v1/auth/login. A wrong number and a wrong password are
 * indistinguishable (dummy-hash compare) — saying more would undo that.
 * Account status policy is enforced here: suspended/disabled/archived
 * accounts cannot sign in.
 */
export const POST = route(async (req: NextRequest) => {
  const body = await readJson(req);
  const primaryPhone = requireString(body, 'primaryPhone');
  const password = requireString(body, 'password');

  const account = await db.userAccount.findFirst({
    where: { party: { primaryPhone } },
    include: { party: true, credential: true },
  });

  const ok = await verifyPassword(password, account?.credential?.passwordHash ?? null);
  if (!account || !ok) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Those credentials were not accepted.');
  }
  if (!maySignIn(account.party.status, account.role as never)) {
    throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account cannot sign in. Contact House For Rent support.');
  }

  await issueSession(account.id);
  const session = await resolveSession();
  return NextResponse.json({
    partyId: account.partyId,
    role: account.role,
    home: homeFor(session!.role),
  });
});
