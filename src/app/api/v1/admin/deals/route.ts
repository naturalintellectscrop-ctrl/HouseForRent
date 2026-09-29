import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/deals — every deal with its state distribution, for the
 * deal queue and the operations overview (F-007, FR-10.4).
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter behind the HTTP role gate. A `status` query filter is accepted but
 * the distribution always covers every status, as the adapter computes it.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/admin/deals'));
});
