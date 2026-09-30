import { NextRequest, NextResponse } from 'next/server';
import { findMandatesForOps } from '@/server/mandates';
import { ApiError, requireRole, route } from '@/server/http';

const STATES = ['pending', 'verified', 'rejected'] as const;

/**
 * GET /api/v1/admin/mandates?state=pending|verified|rejected - the ops
 * mandate queue for one state (default pending: that is the state an
 * operator acts on). The decision note is deliberately not served here;
 * it lives in the audit trail.
 */
export const GET = route(async (req: NextRequest) => {
  await requireRole(['admin']);
  const raw = req.nextUrl.searchParams.get('state') ?? 'pending';
  if (!(STATES as readonly string[]).includes(raw)) {
    throw new ApiError(400, 'VALIDATION', 'state must be pending, verified or rejected');
  }
  const state = raw as (typeof STATES)[number];
  return NextResponse.json(await findMandatesForOps({ state }));
});

export const dynamic = 'force-dynamic';
