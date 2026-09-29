import Link from 'next/link';
import { api, type SearchResult } from '@/lib/api';
import { Empty, PropertyCard } from '@/app/ui';

export const metadata = { title: 'Saved homes' };

/**
 * The tenant's bookmarked homes.
 *
 * The cards are the SAME component the public feed renders — a saved home
 * is not a second kind of object. What is saved-but-hidden is stated, not
 * silently dropped: if a home you bookmarked left search (withdrawn, stale,
 * let to someone else), `hiddenCount` says so in words. That is the honest
 * answer, and it is also the useful one — it tells you to look again rather
 * than wonder where the home went.
 */
export default async function SavedPage() {
  const saved = await api<{
    results: SearchResult[];
    hiddenCount: number;
    totalCount: number;
  }>('/v1/listings/saved');

  return (
    <div className="stack-lg">
      <div>
        <h1 className="h1">Saved homes</h1>
        <p className="lede">
          Homes you bookmarked while looking. Nobody is told that you saved a
          home — it is your list, and saving is not a request or a commitment.
        </p>
      </div>

      {saved.totalCount === 0 ? (
        <Empty
          title="Nothing saved yet"
          action={
            <Link href="/properties" className="btn btn-primary">
              Browse verified homes
            </Link>
          }
        >
          When you find a home worth a second look, use “Save this home” on its
          page. It keeps it here so you do not have to search for it again.
        </Empty>
      ) : (
        <>
          {saved.results.length === 0 ? (
            <Empty
              title="Your saved homes are no longer in search"
              action={
                <Link href="/properties" className="btn btn-primary">
                  Find current homes
                </Link>
              }
            >
              Every home you saved has been let, withdrawn, or has not had its
              availability confirmed recently. Saved homes only stay listed
              while they are still genuinely available.
            </Empty>
          ) : (
            <div className="grid-cards">
              {saved.results.map((listing) => (
                <PropertyCard key={listing.listingId} listing={listing} />
              ))}
            </div>
          )}

          {saved.hiddenCount > 0 ? (
            <p className="notice notice-info" role="note">
              {saved.hiddenCount}{' '}
              {saved.hiddenCount === 1 ? 'home' : 'homes'} you saved{' '}
              {saved.hiddenCount === 1 ? 'is' : 'are'} no longer shown in
              search — let, withdrawn, or not confirmed recently.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
