'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/app/ui';

/**
 * The route-segment error boundary (client component; Next.js contract).
 *
 * Why this file exists: until this boundary there was NO error.tsx anywhere
 * in the app, so an unhandled render error fell through to Next.js's
 * unstyled default screen - no brand, no way back, no recovery. This page
 * is the honest counterpart to not-found.tsx: it tells the truth ("we
 * hit an error on our side"), offers the two actions that actually help
 * (retry the failed segment, go home), and surfaces the opaque `digest`
 * so a user reporting a problem can be matched to the server log entry
 * (Next.js logs the same digest server-side) without ever exposing the
 * error's own message or stack, which could carry internal details.
 *
 * Scope note: this boundary renders INSIDE the failing segment's layouts,
 * so the role chrome may still be visible around it. A failure of the
 * root layout itself is global-error.tsx's job.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side breadcrumb only (the browser console). Server-rendered
    // errors are already logged by Next.js on the server with the same
    // digest - this never sends anything anywhere.
    console.error('[app] unhandled render error', error);
  }, [error]);

  return (
    <div className="notfound-wrap">
      <span className="notfound-mark" aria-hidden="true">
        <Icon.alert size={22} />
      </span>
      <h1 className="h1">Something went wrong on our side.</h1>
      <p className="lede notfound-lede">
        The error was recorded. Nothing was lost by trying again - and if it
        keeps happening, the homepage is one click away.
      </p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to the homepage
        </Link>
      </div>
      {error.digest ? (
        <p className="faint" style={{ fontSize: '0.875rem' }}>
          If you report this, quote: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
