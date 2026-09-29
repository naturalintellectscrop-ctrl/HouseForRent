import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/viewings/mine — the tenant's own viewing list, in the API
 * contract shape (`TenantViewing[]`, with the server-written
 * `whatHappensNext` sentence).
 *
 * ── Why this handler is a forward to the in-process resolver ──
 * The contract shape for this path already exists — the server components
 * read it through the in-process adapter (src/lib/api.ts), which maps the
 * service rows into exactly what the portals render. Duplicating that
 * mapping here would be a second implementation free to drift from the
 * first, so the HTTP edge adds session enforcement and nothing else.
 * (Added by Task 7-a: the path existed in the contract and the adapter, but
 * had no route handler, so the browser got a 404 HTML page.)
 */
export const GET = route(async () => {
  // The HTTP edge enforces the session and the role — the same guard the
  // in-process resolver applies — so a wrong-role or anonymous caller gets
  // the API's own 401/403 error shape.
  await requireRole(['tenant']);
  return NextResponse.json(await api('/v1/viewings/mine'));
});
