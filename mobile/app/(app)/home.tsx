import { useSession } from '@/lib/session';
import TenantSearch from '@/components/tenant-search';
import ListerListings from '@/components/lister-listings';

/**
 * The first tab, in whichever mode the signed-in role implies.
 *
 * Split into two components rather than one screen full of conditionals:
 * a tenant searching and a landlord managing inventory share no state, no
 * layout and no failure modes, and pretending otherwise makes both harder
 * to read.
 */
export default function Home() {
  const { role } = useSession();
  return role === 'lister' ? <ListerListings /> : <TenantSearch />;
}
