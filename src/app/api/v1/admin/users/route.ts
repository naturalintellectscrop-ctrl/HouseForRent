import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/users?q=… — the admin's account directory. Rows carry
 * account standing (role, status, identity-verified, usage counts); they
 * deliberately do NOT join identity documents or ledger balances — those
 * stay subject-scoped behind the audit trail.
 */
export const GET = route(async (req: NextRequest) => {
  await requireRole(['admin']);
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const path = q ? `/v1/admin/users?q=${encodeURIComponent(q)}` : '/v1/admin/users';
  return NextResponse.json(await api(path));
});
