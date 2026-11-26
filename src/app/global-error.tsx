'use client';

import { useEffect } from 'react';

/**
 * The last-resort boundary: renders when the ROOT LAYOUT itself throws, so
 * it cannot rely on the design system, global CSS or any layout markup -
 * it must ship its own <html>/<body> (Next.js contract) and stays inline-
 * styled on purpose. The visual bar is deliberately low: legible, honest,
 * and offering one working recovery action (a full reload re-runs the
 * failed root render from scratch).
 */
export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] root layout error', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '70vh',
          display: 'grid',
          placeContent: 'center',
          justifyItems: 'start',
          gap: '1rem',
          padding: '2rem 1.25rem',
          background: '#f6f4ef',
          color: '#1f2937',
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <h1 style={{ fontSize: '1.75rem', margin: 0 }}>
          Something went wrong on our side.
        </h1>
        <p style={{ margin: 0, maxWidth: '36rem', lineHeight: 1.6 }}>
          The error was recorded. A reload usually clears it; if it keeps
          happening, please come back a little later.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: '0.6rem 1.1rem',
              borderRadius: 8,
              border: '1px solid #1f2937',
              background: '#1f2937',
              color: '#f6f4ef',
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
        {error.digest ? (
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
            If you report this, quote: {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
