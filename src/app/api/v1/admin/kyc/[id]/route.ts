import { NextRequest, NextResponse } from 'next/server';
import { requireRole, route } from '@/server/http';
import { adminKycDetail } from '@/server/kyc';

/**
 * GET /api/v1/admin/kyc/:id — the full review record: the application with
 * its evidence references, the applicant, the cited property, and the
 * append-only decision trail. Admin-only; the documents themselves are
 * fetched through /api/v1/media/:id, which re-authorizes every byte.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole(['admin']);
  const { id } = await ctx.params;
  return NextResponse.json(await adminKycDetail(id));
});
