import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/listings/:id/photos — the photographs of a listing, each with
 * the server-asserted provenance label the UI must display verbatim.
 *
 * Access is staff-or-owner, enforced inside the resolver (403 for tenants;
 * landlord ownership returns 404-not-403). Forwarding to the in-process
 * adapter keeps one implementation of the shape. (Added by the QA round:
 * contract path that existed only in the adapter.)
 */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireRole(['lister', 'admin', 'foo']);
  return NextResponse.json(await api(`/v1/listings/${id}/photos`));
});
