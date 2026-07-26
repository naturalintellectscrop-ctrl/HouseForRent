import { NextRequest, NextResponse } from 'next/server';
import { getSession, clearSessionCookie } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getSession(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json(user);
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ message: 'Logged out' });
  clearSessionCookie(response);
  return response;
}
