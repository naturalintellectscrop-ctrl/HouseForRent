import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, issueSession, resolveSession, homeFor } from '@/server/auth';
import { ApiError, readJson, requireString, route } from '@/server/http';

/**
 * POST /api/v1/auth/register - self-service registration.
 * Only `tenant` and `lister` exist here; staff are provisioned through
 * /api/v1/ops/staff by an admin, and this endpoint refuses any other value
 * regardless of what the client sends (DTO allowlist rule).
 */
export const POST = route(async (req: NextRequest) => {
  const body = await readJson(req);
  const displayName = requireString(body, 'displayName');
  const primaryPhone = requireString(body, 'primaryPhone');
  const password = requireString(body, 'password');
  const role = requireString(body, 'role');

  if (displayName.length < 2) throw new ApiError(400, 'VALIDATION', 'Enter the name you would like us to use.');
  if (primaryPhone.replace(/\D/g, '').length < 9) {
    throw new ApiError(400, 'VALIDATION', 'Enter your phone number, including the country code.');
  }
  if (password.length < 8) throw new ApiError(400, 'VALIDATION', 'Choose a password of at least 8 characters.');
  if (role !== 'tenant' && role !== 'lister') {
    throw new ApiError(400, 'VALIDATION', 'Choose whether you are looking for a home or letting one.');
  }

  const existing = await db.party.findUnique({ where: { primaryPhone } });
  if (existing) throw new ApiError(409, 'PHONE_TAKEN', 'An account already exists for that number. Sign in instead.');

  const created = await db.$transaction(async (tx) => {
    const party = await tx.party.create({
      data: { displayName, primaryPhone, status: 'pending_verification' },
    });
    const account = await tx.userAccount.create({ data: { partyId: party.id, authRole: role } });
    await tx.userCredential.create({
      data: { userAccountId: account.id, passwordHash: await hashPassword(password) },
    });
    if (role === 'lister') {
      await tx.listerProfile.create({ data: { partyId: party.id, tier: 'property_owner' } });
    }
    await tx.consentRecord.create({
      data: { partyId: party.id, purpose: 'terms', policyVersion: 'v1', grantedAt: new Date() },
    });
    return { party, account };
  });

  await issueSession(created.account.id);
  const session = await resolveSession();
  return NextResponse.json({ partyId: created.party.id, role: role, home: homeFor(session!.role) }, { status: 201 });
});
