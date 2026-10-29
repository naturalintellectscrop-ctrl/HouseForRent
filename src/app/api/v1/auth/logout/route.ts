import { NextRequest, NextResponse } from 'next/server';
import { revokeCurrentSession } from '@/server/auth';
import { route } from '@/server/http';

/**
 * POST /api/v1/auth/logout - revokes the session server-side (so the token
 * cannot be replayed) and clears the cookie. Works as a plain HTML form
 * target: redirects home with 303, no JavaScript required.
 */
export const POST = route(async (req: NextRequest) => {
  await revokeCurrentSession();
  // ── Redirect to the origin the request ACTUALLY came from ──
  // A base-URL env var with a localhost fallback once sent production
  // sign-outs to http://localhost:3000/ - the browser followed it, found
  // nothing there, and the user stayed on the page looking signed in
  // (round-60 owner report: "there's no way to sign out"). The forwarded
  // headers carry the true origin behind the sandbox gateway and on
  // Vercel; the request URL is the direct-connection fallback.
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ??
    req.headers.get('host') ??
    req.nextUrl.host;
  const proto =
    req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ??
    req.nextUrl.protocol.replace(':', '');
  return NextResponse.redirect(new URL('/', `${proto}://${host}`), 303);
});
