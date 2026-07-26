import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createHmac, timingSafeEqual } from 'crypto';

const SESSION_COOKIE = 'hfr_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'hfr-dev-secret-change-in-production-32chars!!';

// Sign a userId into an opaque token
function signToken(userId: string): string {
  const timestamp = Date.now().toString(36);
  const payload = `${userId}.${timestamp}`;
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

// Verify and extract userId from signed token
function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [userId, timestamp, signature] = parts;
    const expectedSig = createHmac('sha256', SESSION_SECRET).update(`${userId}.${timestamp}`).digest('hex');
    // Timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) return null;
    // Check token age (7 days max)
    const tokenAge = Date.now() - parseInt(timestamp, 36);
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (tokenAge > maxAge) return null;
    return userId;
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string | null;
}

export async function getSession(request?: NextRequest): Promise<SessionUser | null> {
  try {
    if (!request) return null;

    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    const userId = verifyToken(token);
    if (!userId) return null;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, avatar: true },
    });

    return user || null;
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, userId: string): void {
  const token = signToken(userId);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
