import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/verification-queue - listings not yet live and what each
 * is waiting on (FR-10.2). The `blockedBy` computation is the server's.
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter - the one implementation of the contract shape - behind the HTTP
 * role gate the adapter itself does not run.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/admin/verification-queue'));
});
