import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/activity/mine — the signed-in tenant's or landlord's recent
 * real events (deal transitions and viewing status), newest first. Every
 * row names a record the server already holds; the sentences are written
 * server-side and rendered verbatim.
 */
export const GET = route(async () => {
  await requireRole(['tenant', 'lister']);
  return NextResponse.json(await api('/v1/activity/mine'));
});
