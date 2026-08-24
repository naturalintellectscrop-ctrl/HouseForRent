import { requireRole } from '@/lib/session';

/**
 * The landlord section, narrowed.
 *
 * ── Why this exists beside the portal layout ──
 * The portal shell admits tenants and landlords alike, because they share
 * the chrome. Admitting a tenant into `/landlord` on that basis would show
 * them landlord navigation and an empty portfolio built from a 403 — a
 * confusing dead end rather than a redirect to where they belong. A nested
 * layout runs after its parent, so this narrows without duplicating the
 * shell.
 *
 * As everywhere else, this is a courtesy and not the boundary: it reads a
 * cookie the browser can rewrite, and every call behind it is authorised
 * server-side against the real session (NFR-1).
 */
export default async function LandlordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(['lister', 'admin']);
  return <>{children}</>;
}
