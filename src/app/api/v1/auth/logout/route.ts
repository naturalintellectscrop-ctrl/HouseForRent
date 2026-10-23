import { NextResponse } from 'next/server';
import { revokeCurrentSession } from '@/server/auth';
import { route } from '@/server/http';

/**
 * POST /api/v1/auth/logout - revokes the session server-side (so the token
 * cannot be replayed) and clears the cookie. Works as a plain HTML form
 * target: redirects home with 303, no JavaScript required.
 */
export const POST = route(async () => {
  await revokeCurrentSession();
  return NextResponse.redirect(new URL('/', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'), 303);
});
