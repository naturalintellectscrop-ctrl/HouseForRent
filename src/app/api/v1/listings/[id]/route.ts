import { NextRequest, NextResponse } from 'next/server';
import { publicDetail } from '@/server/listings';
import { ApiError, route } from '@/server/http';

/**
 * GET /api/v1/listings/:id - public detail. Reuses the feed's visibility
 * rules; a non-public listing is 404, not 403, so an unpublished address
 * cannot be discovered by probing.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const detail = await publicDetail(id);
  if (!detail) throw new ApiError(404, 'LISTING_NOT_FOUND', 'that listing does not exist or is not public');
  return NextResponse.json(detail);
});
