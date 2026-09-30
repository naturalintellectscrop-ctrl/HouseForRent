import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/launch-gate - verified-fresh live inventory against the
 * configured bar (FR-10.3).
 *
 * TASK 7-b (additive route, sandbox adaptation): the in-process adapter in
 * `src/lib/api.ts` is the ONE implementation of this read's shape; this
 * handler exposes it over the same HTTP contract the NestJS API published.
 * The role gate runs HERE - the adapter trusts its caller's session, the
 * HTTP edge must not.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/admin/launch-gate'));
});
