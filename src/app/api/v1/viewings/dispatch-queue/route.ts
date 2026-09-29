import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/viewings/dispatch-queue — requested viewings waiting for an
 * officer, with per-row blockers and officer load (FR-5.2, the fix for
 * F-002). Admin-only: dispatch is an admin decision.
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter behind the HTTP role gate, matching the admin-only guard the real
 * API ran (the /ops page renders its 403 as an explanation, not a stack
 * trace).
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/viewings/dispatch-queue'));
});
