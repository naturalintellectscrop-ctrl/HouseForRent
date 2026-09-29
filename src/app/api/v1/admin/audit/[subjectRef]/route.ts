import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/audit/:subjectRef — the audit trail for ONE subject: a
 * deal id, a listing id, a config key (NFR-2). Lookup by subject, never a
 * browsable firehose — an accountability record should not double as a way
 * to page through everyone.
 *
 * TASK 7-b (additive route, sandbox adaptation): delegates to the in-process
 * adapter behind the HTTP role gate.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ subjectRef: string }> }) => {
  await requireRole(['admin']);
  const { subjectRef } = await ctx.params;
  return NextResponse.json(await api(`/v1/admin/audit/${encodeURIComponent(subjectRef)}`));
});
