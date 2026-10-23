import { NextResponse } from 'next/server';
import { requireSession, route } from '@/server/http';

/** GET /api/v1/auth/me - who the session belongs to. */
export const GET = route(async () => {
  const session = await requireSession();
  return NextResponse.json({
    partyId: session.partyId,
    displayName: session.displayName,
    role: session.role,
    partyStatus: session.partyStatus,
    verificationState: session.verificationState,
  });
});
