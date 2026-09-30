import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/ops/officers - the officers dispatch can send, with their
 * open load (Task 16). Backs both the dispatch queue's assign select and
 * the reassign control on a scheduled visit record; one service
 * implementation (`assignableOfficers`) serves both, so the two selects
 * can never disagree about who is sendable.
 */
export const GET = route(async () => {
  await requireRole(['admin']);
  return NextResponse.json(await api('/v1/ops/officers'));
});
