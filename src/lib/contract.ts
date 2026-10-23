/**
 * The API contract: the shapes the backend returns, and the one helper that
 * turns a media path into a URL.
 *
 * ── Why this is separate from `api.ts` ──
 * `api.ts` imports the database and session resolution, which makes it
 * server-only. A client component that needs nothing but a TYPE would drag
 * that whole module into the browser bundle. Types and pure functions live
 * here; anything that talks to the network or the database lives there.
 */

/**
 * The media base. In the sandbox the API is same-origin, so media paths are
 * plain paths. Safe to inline into the client bundle: it is a public image
 * route, not a secret, and the URL has to be resolvable by the browser for
 * an image to render at all.
 */
const MEDIA_BASE = '';

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
  /** A path on the media route. See `mediaUrl()`. */
  url: string;
  caption: string | null;
  sortOrder: number;
  source: string;
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
  propertyType: string;
  neighbourhoodName: string;
  landmarkText: string;
  isVerified: boolean;
  isStale: boolean;
  daysSinceConfirmed: number | null;
  furnished: string;
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

/** What our officer recorded on site - structured, never free text. */
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
   * own terms - the same basis `fund-escrow` uses (F-012). Displayed here,
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
  /**
   * The signed-in tenant's bookmark state for this listing, resolved
   * server-side. `null` for anonymous visitors and non-tenant roles - no
   * toggle renders for them (saving is a private tenant surface).
   */
  savedByCaller?: boolean | null;
  neighbourhoodDistrict?: string;
  streetAddress?: string | null;
  listerDisplayName?: string;
  availabilityConfirmedAt?: Date | null;
}

export interface Neighbourhood {
  id: string;
  name: string;
  district?: string;
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
  /** The mandate row for this property, if the account ever submitted one. */
  mandateState: string | null;
  hasAcceptedAgreement: boolean;
  agreementId?: string | null;
  agreementAcceptedAt?: string | null;
  commissionRateBp?: number | null;
  photos?: ListingPhoto[];
  /** Server-computed. This app renders it and holds no opinion of its own. */
  blockedBy: string[];
  canPublish: boolean;
}

/**
 * Turns an API-relative media path into one this browser can load.
 */
export function mediaUrl(path: string): string {
  return `${MEDIA_BASE}${path}`;
}
