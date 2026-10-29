/**
 * Route-level loading skeletons.
 *
 * The shells above these files are static chrome (layout.tsx renders
 * outside the loading boundary), so the sidebar, topbar and identity stay
 * put while the page's data resolves - the skeleton fills only the content
 * area, which is exactly the region that is waiting.
 */

/** Dashboard-shaped skeleton: page head, stat row, content cards. */
export function DashboardSkeleton({
  stats = 4,
}: {
  stats?: number;
}) {
  return (
    <div aria-hidden="true" className="stack-lg">
      <div className="page-head">
        <div className="page-head-titles stack">
          <div className="skeleton" style={{ height: '2rem', width: '16rem' }} />
          <div className="skeleton" style={{ height: '0.9rem', width: '22rem' }} />
        </div>
      </div>
      <div
        className="metrics"
        style={{ gridTemplateColumns: `repeat(auto-fit, minmax(10.5rem, 1fr))` }}
      >
        {Array.from({ length: stats }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: '8.25rem', borderRadius: 'var(--radius-xl)' }} />
        ))}
      </div>
      <div className="plat-grid-2">
        <div className="skeleton" style={{ height: '16rem', borderRadius: 'var(--radius-xl)' }} />
        <div className="skeleton" style={{ height: '16rem', borderRadius: 'var(--radius-xl)' }} />
      </div>
    </div>
  );
}

/** Property-detail skeleton: gallery frame + info column. */
export function PropertyDetailSkeleton() {
  return (
    <div aria-hidden="true" className="stack-lg">
      <div className="stack">
        <div className="skeleton" style={{ height: '2.2rem', width: '24rem', maxWidth: '100%' }} />
        <div className="skeleton" style={{ height: '1rem', width: '14rem' }} />
      </div>
      <div
        className="detail-grid"
        style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr' }}
      >
        <div className="skeleton" style={{ height: '24rem', borderRadius: 'var(--radius-xl)' }} />
        <div className="stack">
          <div className="skeleton" style={{ height: '10rem', borderRadius: 'var(--radius-xl)' }} />
          <div className="skeleton" style={{ height: '6rem', borderRadius: 'var(--radius-xl)' }} />
        </div>
      </div>
    </div>
  );
}
