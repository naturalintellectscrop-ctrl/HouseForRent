import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// In-memory rate limit store (resets on server restart)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Rate limit configuration per route type
const RATE_LIMITS: Record<string, { windowMs: number; maxRequests: number }> = {
  // Auth routes: 15 attempts per minute per IP (login/register)
  auth: { windowMs: 60 * 1000, maxRequests: 15 },
  // Upload routes: 20 uploads per minute per IP
  upload: { windowMs: 60 * 1000, maxRequests: 20 },
  // Property creation: 20 per minute per IP
  property: { windowMs: 60 * 1000, maxRequests: 20 },
  // General API: 60 per minute per IP
  general: { windowMs: 60 * 1000, maxRequests: 60 },
};

function getRateLimitCategory(pathname: string): string {
  if (pathname.startsWith('/api/auth')) return 'auth';
  if (pathname.startsWith('/api/upload')) return 'upload';
  if (pathname.startsWith('/api/properties') && !pathname.includes('by-city')) return 'property';
  return 'general';
}

function getClientIdentifier(request: NextRequest): string {
  // Use IP + user-agent for identification
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent.slice(0, 50)}`;
}

export function middleware(request: NextRequest) {
  // Only rate limit API routes
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const category = getRateLimitCategory(request.nextUrl.pathname);
  const config = RATE_LIMITS[category] || RATE_LIMITS.general;
  const clientId = `${getClientIdentifier(request)}:${category}`;
  const now = Date.now();

  // Clean up expired entries periodically (every 100 requests checked)
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }

  const current = rateLimitMap.get(clientId);

  if (!current || now > current.resetTime) {
    // New window
    rateLimitMap.set(clientId, { count: 1, resetTime: now + config.windowMs });
  } else if (current.count >= config.maxRequests) {
    // Rate limited
    const retryAfter = Math.ceil((current.resetTime - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.', retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(current.resetTime / 1000)),
        },
      }
    );
  } else {
    current.count++;
  }

  // Add rate limit headers to response
  const response = NextResponse.next();
  const entry = rateLimitMap.get(clientId);
  const remaining = Math.max(0, config.maxRequests - (entry?.count || 1));
  response.headers.set('X-RateLimit-Limit', String(config.maxRequests));
  response.headers.set('X-RateLimit-Remaining', String(remaining));

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
