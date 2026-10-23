import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/listings/saved - the signed-in tenant's bookmarked homes, in
 * the same card shape as the public feed, plus `hiddenCount` for saved
 * homes that have left search. Static segment: this route must win over
 * `/api/v1/listings/[id]` (Next.js resolves static before dynamic).
 */
export const GET = route(async () => {
  await requireRole(['tenant']);
  return NextResponse.json(await api('/v1/listings/saved'));
});
