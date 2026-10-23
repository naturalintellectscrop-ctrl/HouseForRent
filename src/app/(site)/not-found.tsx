import Link from 'next/link';
import { TAGLINE } from '@/app/ui';

/**
 * The branded 404. The default Next.js not-found page is an unstyled dead
 * end - no brand, no way back - which is exactly what "no dead ends on any
 * interaction" forbids. Every dead address now lands here: the same chrome,
 * an honest sentence, and the two routes that matter.
 */
export default function NotFound() {
  return (
    <div className="section-lg">
      <div className="page stack" style={{ maxWidth: '40rem' }}>
        <h1 className="h1">This page does not exist.</h1>
        <p className="lede">
          The address may be mistyped, or the page may have moved. Nothing
          here was published and then quietly withdrawn - if a home leaves
          search, it leaves deliberately, and links to it stop working.
        </p>
        <div className="row">
          <Link href="/" className="btn btn-primary">
            Back to the homepage
          </Link>
          <Link href="/properties" className="btn btn-secondary">
            Browse homes
          </Link>
        </div>
        <p className="faint" style={{ fontSize: '0.875rem' }}>
          {TAGLINE}
        </p>
      </div>
    </div>
  );
}
