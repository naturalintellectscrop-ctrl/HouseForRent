import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { requireRole, route } from '@/server/http';

/**
 * GET /api/v1/admin/users?q=…&role=… - the admin's account directory. Rows
 * carry account standing (role, status, identity-verified, usage counts);
 * they deliberately do NOT join identity documents or ledger balances -
 * those stay subject-scoped behind the audit trail. `role` filters the
 * directory server-side (Task 15); an unknown value is a 422, never a
 * silently ignored filter.
 */
export const GET = route(async (req: NextRequest) => {
  await requireRole(['admin']);
  const q = req.nextUrl.searchParams.get('q') ?? undefined;
  const role = req.nextUrl.searchParams.get('role') ?? undefined;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (role) params.set('role', role);
  const qs = params.toString();
  return NextResponse.json(await api(`/v1/admin/users${qs ? `?${qs}` : ''}`));
});
