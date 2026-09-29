/**
 * Presentation shared across the whole product — marketplace, portals and
 * the operations console.
 *
 * All server-rendered: there is no `'use client'` here, so none of it
 * reaches the browser as JavaScript. Anything genuinely interactive lives
 * in its own client file next to the page that needs it.
 */

import Link from 'next/link';
import type { ListingPhoto } from '@/lib/contract';
import { mediaUrl } from '@/lib/contract';

/* ── iconography ────────────────────────────────────────────────────── */

/**
 * Thin-line SVG, drawn on a 24-grid, inheriting `currentColor`.
 *
 * ── Why not emoji ──
 * An emoji renders as a different picture on every platform, cannot take
 * the brand colour, and is read aloud by a screen reader as whatever
 * Unicode named it in 2015. For an interface whose job is to look
 * trustworthy, that is three problems for no benefit.
 *
 * Every icon here is decorative and marked `aria-hidden`: the meaning is
 * always in the adjacent text, never in the glyph.
 */
function Svg({
  children,
  size = 18,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const Icon = {
  check: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  ),
  shield: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  pin: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  ),
  bed: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M3 7v11M3 12h18v6M21 18v-6a3 3 0 0 0-3-3h-6v3" />
      <circle cx="7.5" cy="10.5" r="1.8" />
    </Svg>
  ),
  bath: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" />
      <path d="M7 12V6a2 2 0 0 1 4 0" />
      <path d="M6 19l-1 2M18 19l1 2" />
    </Svg>
  ),
  camera: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M3 8h3l1.5-2h9L18 8h3v11H3z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  ),
  clock: (p: { size?: number }) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  ),
  lock: (p: { size?: number }) => (
    <Svg {...p}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  key: (p: { size?: number }) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l9 9M17 17l2-2M14 14l2-2" />
    </Svg>
  ),
  arrow: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  menu: (p: { size?: number }) => (
    <Svg {...p} size={p.size ?? 22}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
  user: (p: { size?: number }) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </Svg>
  ),
  building: (p: { size?: number }) => (
    <Svg {...p}>
      <path d="M4 21V6l7-3v18M11 21h9V10l-9-3" />
      <path d="M7 9h.01M7 13h.01M15 12h.01M15 16h.01" />
    </Svg>
  ),
};

/* ── brand ──────────────────────────────────────────────────────────── */

export function Brand({ sub, href = '/' }: { sub?: string; href?: string }) {
  return (
    <Link href={href} className="brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" width={28} height={28} className="brand-mark" />
      House For Rent
      {sub ? <span className="brand-sub">· {sub}</span> : null}
    </Link>
  );
}

/* ── money and dates ────────────────────────────────────────────────── */

/**
 * Shillings arrive as strings and are grouped as strings.
 *
 * ── Why the string is never parsed ──
 * The API serialises money as a string precisely so it never passes through
 * a JS number (API Spec §2). `Number('4200000')` is harmless; a year of
 * rent across a portfolio is not, and 2^53 arrives sooner in shillings than
 * anyone expects. Grouping with a regex keeps the guarantee intact.
 */
export function shillings(value: string): string {
  return `UGX ${value.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
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

export function onDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: 'Africa/Kampala',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "today" / "yesterday" / "4 days ago". Null stays null — never "unknown". */
export function daysAgo(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const FURNISHED_LABEL: Record<string, string> = {
  furnished: 'Furnished',
  semi_furnished: 'Part furnished',
  unfurnished: 'Unfurnished',
};

export const TYPE_LABEL: Record<string, string> = {
  apartment: 'Apartment',
  house: 'House',
  room: 'Single room',
  other: 'Other',
};

/* ── media ──────────────────────────────────────────────────────────── */

/**
 * A property image slot.
 *
 * ── The honest empty frame ──
 * With no photograph this renders a plain marked field saying so. It does
 * NOT fall back to stock imagery. The platform's entire proposition is that
 * the picture was taken in that room by our field officer; a placeholder
 * photograph of somebody else's house quietly sells the one thing we cannot
 * sell, and it is the reason a tenant would stop believing the verified
 * badge next to it.
 *
 * Fixture imagery is labelled on the image itself, where a screenshot
 * cannot crop the label away from the picture.
 */
export function PropertyMedia({
  photo,
  alt,
  priority = false,
  count,
}: {
  photo?: ListingPhoto;
  alt: string;
  priority?: boolean;
  count?: number;
}) {
  if (!photo) {
    return (
      <div className="media">
        <div className="media-empty">
          <Icon.camera size={20} />
          <span>Awaiting officer photography</span>
        </div>
      </div>
    );
  }

  return (
    <div className="media">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl(photo.url)}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
      />
      {photo.isDevelopmentFixture ? (
        <span className="media-fixture">Demo image</span>
      ) : null}
      {count && count > 1 ? (
        <span className="media-count">
          {count} photos
        </span>
      ) : null}
    </div>
  );
}

/* ── property card ──────────────────────────────────────────────────── */

interface CardListing {
  listingId: string;
  monthlyRent: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: string;
  furnished: string;
  neighbourhoodName: string;
  landmarkText: string;
  isVerified: boolean;
  daysSinceConfirmed: number | null;
  photos: ListingPhoto[];
}

/**
 * The unit of the marketplace.
 *
 * ── What is on it and what is not ──
 * Price, place, size, and when someone from this platform last stood there.
 * There is no "★ 4.8", no "3 people viewing now", no saved-search heart —
 * none of those are facts this system holds, and inventing them is how a
 * marketplace stops being believed.
 */
export function PropertyCard({
  listing,
  priority = false,
}: {
  listing: CardListing;
  priority?: boolean;
}) {
  const confirmed = daysAgo(listing.daysSinceConfirmed);

  return (
    <Link href={`/properties/${listing.listingId}`} className="pcard">
      <PropertyMedia
        photo={listing.photos[0]}
        alt={`${TYPE_LABEL[listing.propertyType] ?? 'Home'} in ${listing.neighbourhoodName}`}
        priority={priority}
        count={listing.photos.length}
      />
      <div className="pcard-body">
        <div className="row" style={{ gap: '0.5rem' }}>
          {listing.isVerified ? (
            <span className="badge badge-ok">
              <Icon.check size={12} />
              Verified in person
            </span>
          ) : null}
        </div>
        <p className="pcard-price num">
          {shillings(listing.monthlyRent)} <span>/ month</span>
        </p>
        <p className="pcard-where">{listing.neighbourhoodName}</p>
        <p className="pcard-land">{listing.landmarkText}</p>
        <p className="pcard-facts">
          <span>
            {listing.bedrooms} {listing.bedrooms === 1 ? 'bed' : 'beds'}
          </span>
          <span>
            {listing.bathrooms} {listing.bathrooms === 1 ? 'bath' : 'baths'}
          </span>
          <span>{FURNISHED_LABEL[listing.furnished] ?? listing.furnished}</span>
          {confirmed ? <span>Available {confirmed}</span> : null}
        </p>
      </div>
    </Link>
  );
}

/* ── states ─────────────────────────────────────────────────────────── */

/**
 * An empty state: what is not here, and what to do about it.
 *
 * The `action` slot is the point. "Nothing waiting" tells someone the query
 * returned zero rows; it does not tell them whether that is the system
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

/**
 * Renders a backend rejection with its code.
 *
 * The code is shown on purpose: `FIELD_REPORT_REQUIRED` and
 * `NOT_THE_PROPERTY_OWNER` mean very different things to whoever a person
 * calls for help, and paraphrasing them into "something went wrong"
 * destroys the only diagnostic they have.
 */
export function ApiAlert({
  message,
  code,
}: {
  message: string;
  code?: string | null;
}) {
  return (
    <p className="notice notice-error" role="alert">
      {message}
      {code ? (
        <>
          {' '}
          <code className="mono">{code}</code>
        </>
      ) : null}
    </p>
  );
}

/**
 * A status indicator. The label is REQUIRED, not optional — a status colour
 * must never carry meaning alone (colour-vision deficiency, greyscale
 * print, forced-colors mode).
 */
export function Status({
  tone,
  children,
}: {
  tone: 'neutral' | 'ok' | 'warn' | 'danger';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'ok'
      ? 'badge badge-ok'
      : tone === 'warn'
        ? 'badge badge-warn'
        : tone === 'danger'
          ? 'badge badge-danger'
          : 'badge';
  return <span className={`${cls} badge-dot`}>{children}</span>;
}

const VIEWING_TONE: Record<string, 'neutral' | 'ok' | 'warn' | 'danger'> = {
  requested: 'warn',
  scheduled: 'warn',
  conducted: 'ok',
  no_show: 'danger',
  cancelled: 'neutral',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <Status tone={VIEWING_TONE[status] ?? 'neutral'}>
      {status.replace(/_/g, ' ')}
    </Status>
  );
}

export function ShortId({ value }: { value: string }) {
  return <span className="mono">{value.slice(0, 8)}</span>;
}

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
        <Link href="/ops/today" className="btn btn-secondary">
          Back to your visits
        </Link>
      </p>
    </>
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
          <span className="bar-value num">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * A coloured dot with its label. Kept for the operations console, where a
 * dense row has no room for a full badge — but the label is still required,
 * for the same reason `Status` requires one.
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
