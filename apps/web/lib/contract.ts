/**
 * The API contract: the shapes the backend returns, and the one helper that
 * turns a media path into a URL.
 *
 * ── Why this is separate from `api.ts` ──
 * `api.ts` imports `next/headers` to read the session cookie, which makes it
 * server-only. A client component that needs nothing but a TYPE would drag
 * that whole module — and the API base URL with it — into the browser
 * bundle, which is both a build error and, if it had succeeded, a leak.
 * Types and pure functions live here; anything that talks to the network
 * lives there.
 */

/**
 * The API base, duplicated deliberately.
 *
 * `API_BASE` in `api.ts` is read server-side and never shipped. This one is
 * `NEXT_PUBLIC_` and IS shipped, because an `<img src>` has to resolve in
 * the browser. It points at a public image route and nothing else.
 */
const MEDIA_BASE =
  process.env.NEXT_PUBLIC_MEDIA_BASE ??
  process.env.NEXT_PUBLIC_API_BASE ??
  'http://localhost:3000';

/** ── The public marketplace contract ────────────────────────────────── */

/**
 * A photograph and, inseparably, where it came from.
 *
 * `isFieldVerified` and `isDevelopmentFixture` arrive SERVER-ASSERTED. This
 * app renders the labels; it never decides them. "Our officer photographed
 * this room" is the claim the whole business rests on, and a client free to
 * apply that label itself would be a client that could lie about it.
 */
export interface ListingPhoto {
  id: string;
  mediaAssetId: string;
  /** A path on the API, not on this origin. See `mediaUrl()`. */
  url: string;
  caption: string | null;
  sortOrder: number;
  source: 'field_officer' | 'lister' | 'development_fixture';
  isFieldVerified: boolean;
  isDevelopmentFixture: boolean;
}

/** One card in the feed. Money is a string, always (API Spec §2). */
export interface SearchResult {
  listingId: string;
  propertyId: string;
  monthlyRent: string;
  bedrooms: number;
  bathrooms: number;
  propertyType: 'apartment' | 'house' | 'room' | 'other';
  neighbourhoodName: string;
  landmarkText: string;
  isVerified: boolean;
  isStale: boolean;
  daysSinceConfirmed: number | null;
  furnished: 'furnished' | 'semi_furnished' | 'unfurnished';
  photos: ListingPhoto[];
  freeForTenants: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  limit: number;
  offset: number;
  /** Written server-side (FR-4.4). Rendered verbatim, never replaced. */
  emptyStateMessage: string | null;
}

/** What our officer recorded on site — structured, never free text. */
export interface FieldConfirmed {
  conditionRating: 'excellent' | 'good' | 'fair' | 'poor';
  matchesListing: boolean;
  isAvailable: boolean;
  reportedAt: string;
}

export interface ListingDetail extends SearchResult {
  depositAmount: string;
  requiredMonthsUpfront: number;
  /**
   * What a tenant funds at agreement, DERIVED SERVER-SIDE from the listing's
   * own terms — the same basis `fund-escrow` uses (F-012). Displayed here,
   * never recomputed: a second copy of the figure someone is about to pay is
   * exactly the defect that finding was about.
   */
  expectedUpfront: string;
  descriptionText: string | null;
  neighbourhoodId: string;
  geoLat: number | null;
  geoLng: number | null;
  amenities: { id: string; name: string }[];
  fieldConfirmed: FieldConfirmed | null;
}

export interface Neighbourhood {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  inServiceArea: boolean;
  liveListingCount: number;
}

/** A lister's own inventory row, with what publishing is still waiting on. */
export interface MyListing {
  id: string;
  propertyId: string;
  monthlyRent: string;
  depositAmount: string;
  requiredMonthsUpfront: number;
  bedrooms: number;
  bathrooms: number;
  neighbourhoodName: string;
  landmarkText: string;
  verificationState: 'unverified' | 'verified';
  publicationState:
    | 'draft'
    | 'awaiting_verification'
    | 'live'
    | 'rented'
    | 'withdrawn';
  availabilityStatus: 'available' | 'unavailable';
  availabilityConfirmedAt: string | null;
  hasAcceptedAgreement: boolean;
  /** Server-computed. This app renders it and holds no opinion of its own. */
  blockedBy: string[];
  canPublish: boolean;
}

/**
 * Turns an API-relative media path into one this browser can load.
 *
 * The API serves its own bytes, so in development the two sit on different
 * ports. This is safe to inline into the client bundle: it is a public image
 * host, not a secret, and the URL has to be resolvable by the browser for an
 * image to render at all.
 */
export function mediaUrl(path: string): string {
  return `${MEDIA_BASE}${path}`;
}
