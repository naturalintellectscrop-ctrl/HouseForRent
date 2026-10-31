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
import { Icon } from '@/app/ui';

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

/** Role display names - the internal `foo` key never reaches a human eye. */
export const ROLE_LABEL: Record<string, string> = {
  tenant: 'Tenant',
  lister: 'Lister',
  foo: 'Field officer',
  admin: 'Administrator',
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? humanize(role);
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

/**
 * The shared page head for every control-center route: eyebrow, display
 * title, one honest line of context, and (where a page has them) the
 * existing actions on the right. One component so rhythm and type scale
 * cannot drift between routes.
 */
export function PlatPageHead(props: {
  eyebrow: string;
  title: string;
  lede: string;
  context?: ReactNode;
  actions?: ReactNode;
}): ReactNode {
  return (
    <header className="plat-page-head">
      <div className="stack-sm">
        <div className="plat-head-context">
          <span className="plat-eyebrow">{props.eyebrow}</span>
          {props.context}
        </div>
        <h1 className="h1">{props.title}</h1>
        <p className="muted plat-head-lede">{props.lede}</p>
      </div>
      {props.actions ? <div className="plat-page-actions">{props.actions}</div> : null}
    </header>
  );
}

/**
 * The shared section panel: hairline-headed card with an optional eyebrow,
 * count chip and "Open" link. Every overview section and most page sections
 * render through this, so the console reads as one designed system.
 */
export function SectionCard(props: {
  title: string;
  eyebrow?: string;
  href?: string;
  count?: number | string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="card plat-section">
      <div className="plat-section-head">
        <div className="plat-section-title">
          {props.eyebrow ? <span className="plat-eyebrow">{props.eyebrow}</span> : null}
          <h2 className="h2">{props.title}</h2>
        </div>
        <div className="plat-section-side">
          {props.count !== undefined ? (
            <span className="plat-count">{props.count}</span>
          ) : null}
          {props.href ? (
            <a className="plat-section-link" href={props.href}>
              Open
              <Icon.arrowUpRight size={13} />
            </a>
          ) : null}
        </div>
      </div>
      {props.children}
    </section>
  );
}
