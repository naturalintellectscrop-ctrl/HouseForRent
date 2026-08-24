import { requireRole } from '@/lib/session';

/**
 * The tenant section, narrowed. See the note in `landlord/layout.tsx` —
 * same reasoning, other direction: a landlord following an `/account` link
 * is sent to their own surface rather than shown a tenant dashboard that
 * would be empty by construction.
 */
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['tenant', 'admin']);
  return <>{children}</>;
}
