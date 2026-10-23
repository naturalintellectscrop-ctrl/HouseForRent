import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/listings/mine - the signed-in landlord's own inventory, with
 * the server-computed `blockedBy` list and `canPublish` for each listing.
 *
 * Route order matters and a static segment beats a dynamic one: this file
 * exists so "mine" is never mistaken for a listing id by the
 * `/api/v1/listings/[id]` handler beside it - the same ordering rule the
 * in-process adapter documents (src/lib/api.ts).
 *
 * The contract shape already lives in the in-process resolver the landlord
 * pages read; forwarding to it keeps one implementation instead of a second
 * mapping that could drift. (Added by Task 7-a: the path existed in the
 * contract and the adapter, but had no route handler.)
 */
export const GET = route(async () => {
  await requireRole(['lister']);
  return NextResponse.json(await api('/v1/listings/mine'));
});
