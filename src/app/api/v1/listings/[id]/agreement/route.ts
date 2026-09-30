import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/listings/:id/agreement - the presented listing-agreement
 * terms (commission rate, circumvention clause, acceptance state) for one
 * of the signed-in landlord's own listings.
 *
 * The resolver already enforces landlord ownership (404-not-403 for a
 * listing that is not the caller's). Forwarding to the in-process adapter
 * keeps one implementation of the contract shape. (Added by the QA round:
 * the path existed in the contract and the adapter, but had no route
 * handler, so a real HTTP client got Next.js's 404 HTML instead of JSON.)
 */
export const GET = route(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireRole(['lister']);
  return NextResponse.json(await api(`/v1/listings/${id}/agreement`));
});
