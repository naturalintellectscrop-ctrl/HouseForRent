import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/audit — recent audited events (NFR-2).
 *
 * TASK 7-b (additive route, sandbox adaptation): the reference API only ever
 * exposed audit lookup BY SUBJECT; this unfiltered recent-events read is the
 * adapter's own listing (used by the console's per-subject lookups' fallback)
 * and is exposed here for contract completeness behind the admin gate.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/admin/audit'));
});
