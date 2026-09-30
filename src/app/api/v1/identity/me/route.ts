import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/identity/me - the caller's identity-verification status in
 * the API contract shape (`IdentityStatus`): whether they are verified,
 * what screening has run, and whether consent is on record.
 *
 * ── Why this handler is a forward to the in-process resolver ──
 * The contract shape for this path already exists - the server components
 * read it through the in-process adapter (src/lib/api.ts), which resolves
 * the caller's session and consent record in one place. Duplicating that
 * here would be a second implementation free to drift from the first, so
 * the HTTP edge adds session enforcement and nothing else.
 * (Added by Task 7-a: the path existed in the contract and the adapter, but
 * had no route handler, so the browser got a 404 HTML page.)
 */
export const GET = route(async () => {
  // The HTTP edge enforces the session and the role - the same guard the
  // in-process resolver applies - so a wrong-role or anonymous caller gets
  // the API's own 401/403 error shape.
  await requireRole(['tenant', 'lister']);
  return NextResponse.json(await api('/v1/identity/me'));
});
