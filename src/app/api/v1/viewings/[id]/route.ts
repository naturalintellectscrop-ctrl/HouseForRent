import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/viewings/:id - one field visit in full (API Spec §viewings).
 *
 * Until Task 15 this read was reachable only through the in-process
 * adapter that the staff pages use; the real HTTP surface was missing even
 * though the contract documents it, which meant the harness could not pin
 * the visit record (or the listing context the officer now sees) the way
 * it pins every other read. This route delegates to the same adapter -
 * the one implementation of the contract shape - behind the staff gate.
 * Authorisation lives in the resolver: an officer may read only their own
 * visits, an admin may read any.
 */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requireRole(['foo', 'admin']);
  const { id } = await ctx.params;
  return NextResponse.json(await api(`/v1/viewings/${id}`));
});
