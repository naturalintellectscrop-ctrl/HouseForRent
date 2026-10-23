/**
 * Server-side data plumbing for the control center pages.
 *
 * ── Why every page load is wrapped ──
 * The control center reads live platform data, and the platform must still
 * RENDER when the database is unreachable (the degraded state is a designed
 * behaviour of this product, not an accident). A dead database degrades to a
 * clear panel - it never produces a half-rendered page with missing sections
 * or a 500.
 */
import type { ReactNode } from 'react';

export type DbResult<T> = { ok: true; data: T } | { ok: false };

/** Runs one page's whole data load; any failure degrades the entire page. */
export async function loadPlatformData<T>(load: () => Promise<T>): Promise<DbResult<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (err) {
    // Server log keeps the cause; the surface keeps its composure.
    console.error('[platform] data load failed:', err);
    return { ok: false };
  }
}

/** Shillings formatter that never goes through a JS number (NFR-4). */
export function fmtUGX(amount: bigint): string {
  try {
    return `UGX ${amount.toLocaleString('en-UG')}`;
  } catch {
    return `UGX ${amount.toString()}`;
  }
}

/** `awaiting_verification` → `Awaiting verification`. */
export function humanize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function DegradedPanel({ title }: { title: string }): ReactNode {
  return (
    <div className="plat-degraded card">
      <h2 className="h2">{title}</h2>
      <p className="muted">
        The platform database could not be reached, so these figures are not
        available right now. Nothing was lost - this is the by-design degraded
        state. Retry from the Overview once connectivity returns.
      </p>
    </div>
  );
}

export function SectionCard(props: { title: string; href?: string; children: ReactNode }): ReactNode {
  return (
    <section className="card plat-section">
      <div className="plat-section-head">
        <h2 className="h2">{props.title}</h2>
        {props.href ? (
          <a className="plat-section-link" href={props.href}>
            Open ↗
          </a>
        ) : null}
      </div>
      {props.children}
    </section>
  );
}
