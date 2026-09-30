import { NextRequest, NextResponse } from 'next/server';
import { runIdentityCheckForParty } from '@/server/ops';
import { readJson, requireRole, requireString, route } from '@/server/http';

/**
 * POST /api/v1/admin/users/:partyId/identity-check - operations runs the
 * identity check for an account (Task 14).
 *
 * THE IDENTITY PROVIDER IS A MOCK, and this surface says so. It is the
 * SAME outcome logic the self-service form runs - operations never marks
 * an account verified by hand; it re-runs the check with details given
 * over the phone and the trail records that operations (not the account
 * holder) was the acting party.
 *
 * A structurally-valid-but-mismatching check comes back 200 with
 * state:'failed' - a failed attempt is a true record, not an error. Only
 * a missing account (404) or an inapplicable one, e.g. staff (422), is
 * refused.
 */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ partyId: string }> }) => {
  const session = await requireRole(['admin']);
  const { partyId } = await ctx.params;
  const body = await readJson(req);
  const nin = requireString(body, 'nin');
  const fullName = requireString(body, 'fullName');
  const method = typeof body.method === 'string' && body.method.trim() ? body.method.trim() : 'nin';

  const record = await runIdentityCheckForParty({
    partyId,
    adminPartyId: session.partyId,
    method,
    nin,
    fullName,
  });

  return NextResponse.json(
    { id: record.id, state: record.state, provider: 'sandbox-mock', by: 'operations' },
    { status: 201 },
  );
});

export const dynamic = 'force-dynamic';
