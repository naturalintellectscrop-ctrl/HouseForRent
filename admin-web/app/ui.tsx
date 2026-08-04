/**
 * Presentation helpers shared across the console. All server-rendered — no
 * `use client` here, so none of this reaches the browser as JavaScript.
 */

import Link from 'next/link';

/**
 * The brand lockup and the bar it sits in.
 *
 * Written once. The login page and the console shell each had their own
 * copy of this markup — same image, same width, same trailing "· Field
 * Console" — which is two places for one lockup to drift and the reason a
 * signed-out officer could end up looking at a slightly different header
 * from the one they see after signing in.
 *
 * `nav` is a slot rather than a prop list because the two callers genuinely
 * differ: signed out there is nothing to navigate to.
 */
export function Topbar({ nav }: { nav?: React.ReactNode }) {
  const lockup = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.png"
        alt=""
        width={28}
        height={28}
        className="brand-mark"
      />
      House For Rent <span>· Field Console</span>
    </>
  );

  return (
    <header className="topbar">
      <div className="topbar-inner">
        {/* Signed out there is nowhere for the mark to link to, so it is not
            a link — a control that navigates nowhere is worse than plain
            text for anyone driving this by keyboard. */}
        {nav ? (
          <Link href="/" className="brand">
            {lockup}
          </Link>
        ) : (
          <span className="brand">{lockup}</span>
        )}
        {nav ? <nav>{nav}</nav> : null}
      </div>
    </header>
  );
}

/**
 * An empty state: what is not here, and what to do about it.
 *
 * The `action` slot is the point. "Nothing waiting" tells an ops officer the
 * query returned zero rows; it does not tell them whether that is the system
 * working or the system broken, nor where to go next. Every call site is
 * required to at least think about that second sentence.
 */
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  requested: 'pill',
  scheduled: 'pill pill-warn',
  conducted: 'pill pill-ok',
  no_show: 'pill pill-danger',
  cancelled: 'pill',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={STATUS_TONE[status] ?? 'pill'}>
      {status.replace('_', ' ')}
    </span>
  );
}

/**
 * Dates are rendered in Kampala time explicitly rather than the server's
 * locale. A field officer reading "14:00" needs it to mean 14:00 where they
 * are standing.
 */
export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Africa/Kampala',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ShortId({ value }: { value: string }) {
  return <span className="mono">{value.slice(0, 8)}</span>;
}

/**
 * Renders a backend rejection with its code.
 *
 * The code is shown on purpose: `FIELD_REPORT_REQUIRED` and
 * `NOT_ASSIGNED_FOO` mean very different things to whoever an officer calls
 * for help, and paraphrasing them into "something went wrong" destroys the
 * only diagnostic they have from a stairwell with one bar of signal.
 */
/**
 * What an admin-only page renders when a field officer opens it.
 *
 * The backend is what refuses (403); this turns that into an explanation
 * rather than a stack trace. It is NOT the access control — hiding the link
 * and rendering this page would both be trivially bypassed, which is
 * precisely why neither is relied upon (NFR-1).
 */
export function AdminOnly({ what }: { what: string }) {
  return (
    <>
      <h1>Admin only</h1>
      <p className="lede">
        {what} is restricted to admin accounts. Your account is a field
        officer, so the server declined the request.
      </p>
      <p>
        <Link href="/" className="btn btn-secondary">
          Back to your visits
        </Link>
      </p>
    </>
  );
}

/**
 * A status indicator. The label is REQUIRED, not optional — a status colour
 * must never carry meaning alone (colour-vision deficiency, greyscale
 * print, forced-colors).
 */
export function StatusDot({
  tone,
  label,
}: {
  tone: 'good' | 'warning' | 'critical';
  label: string;
}) {
  return (
    <span>
      <span className={`dot dot-${tone}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * A one-hue magnitude bar list. Identity comes from each row's label, never
 * from a per-row colour — cycling hues here would encode identity in a
 * channel that carries none, and bury whichever row actually matters.
 */
export function BarList({
  rows,
}: {
  rows: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((row) => (
        <div key={row.label} className="bar-row">
          <span>{row.label.replace(/_/g, ' ')}</span>
          <span className="bar-track">
            <span
              className="bar-fill"
              style={{ width: `${(row.value / max) * 100}%` }}
            />
          </span>
          <span className="bar-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Shillings arrive as strings; group them for reading without parsing. */
export function shillings(value: string): string {
  return `UGX ${value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function ApiAlert({
  message,
  code,
}: {
  message: string;
  code?: string | null;
}) {
  return (
    <p className="alert alert-error" role="alert">
      {message}
      {code && (
        <>
          {' '}
          <code>{code}</code>
        </>
      )}
    </p>
  );
}
