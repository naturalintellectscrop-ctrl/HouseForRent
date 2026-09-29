import Link from 'next/link';

/**
 * The root fallback 404 (ops, portal and any segment without its own
 * boundary). Deliberately self-sufficient — the role chrome is not rendered
 * here — but never a dead end: the two routes that matter are one click
 * away, and the copy tells the truth about why the address is dead.
 * Public routes get the fully-chromed version at (site)/not-found.tsx.
 */
export default function RootNotFound() {
  return (
    <div
      style={{
        minHeight: '70vh',
        display: 'grid',
        placeContent: 'center',
        justifyItems: 'start',
        gap: '1rem',
        padding: '2rem 1.25rem',
      }}
    >
      <p className="eyebrow">404</p>
      <h1 className="h1">This page does not exist.</h1>
      <p className="lede" style={{ maxWidth: '36rem' }}>
        The address may be mistyped, or the page may have moved.
      </p>
      <div className="row">
        <Link href="/" className="btn btn-primary">
          Back to the homepage
        </Link>
        <Link href="/ops" className="btn btn-secondary">
          Staff console
        </Link>
      </div>
    </div>
  );
}
