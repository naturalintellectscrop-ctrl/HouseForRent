import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/viewings/assigned/me - the officer's own board (FR-5.2).
 * Resolved from the CALLER's session server-side; a caller cannot read
 * another officer's visits even by asking differently.
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter - the one implementation of the contract shape - behind the HTTP
 * staff gate.
 */
export const GET = route(async () => {
  await requireRole(['foo', 'admin']);
  return NextResponse.json(await api('/v1/viewings/assigned/me'));
});
