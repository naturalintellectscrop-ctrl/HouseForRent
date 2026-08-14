import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * The only place this app talks to the backend.
 *
 * ── This app is a THIN CLIENT ──
 * Technical Architecture §7: "The mobile app never computes commission,
 * never holds authoritative deal state, never contacts the PSP. It renders
 * server state and issues intent. This is a security and correctness
 * boundary, not just a layering preference — money logic on a client is
 * money logic an attacker can rewrite."
 *
 * So: nothing in this app computes a commission, decides whether a deal may
 * advance, or judges whether a listing is stale. It POSTs intent and renders
 * whatever the server says. Every rule that matters lives in `../backend`,
 * enforced by the guards and services of Stages 0–8.
 *
 * ── Money never becomes a number ──
 * The API serialises money as STRINGS (API Spec §2) precisely so it never
 * passes through IEEE-754. This file keeps them as strings; only
 * `lib/money.ts` interprets them, and it uses BigInt.
 */

/**
 * Where the API lives.
 *
 * `10.0.2.2` is the Android EMULATOR's alias for the host machine's
 * loopback — `localhost` inside the emulator is the emulator itself.
 *
 * ── A physical device needs the override ──
 * `Platform.OS === 'android'` is true on an emulator and on a handset
 * alike, so the branch below cannot tell them apart, and `10.0.2.2` routes
 * to nothing on a real phone. (`Constants.isDevice` would distinguish them
 * but moved to `expo-device` in SDK 57, which is not a dependency here.)
 *
 * So for a USB-attached device, run:
 *
 *     adb reverse tcp:3000 tcp:3000
 *     EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 npx expo run:android
 *
 * `adb reverse` maps the handset's own `localhost:3000` back to the host,
 * and the env var is what points this file at it. Without the var the app
 * builds fine and then fails every request, which is a slow way to find out.
 */
function resolveBaseUrl(): string {
  const configured = (Constants.expoConfig?.extra as { apiBaseUrl?: string })
    ?.apiBaseUrl;
  if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }
  if (Platform.OS === 'android') {
    return configured ?? 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
}

export const API_BASE = resolveBaseUrl();

/**
 * A backend rejection, carrying the code `DomainExceptionFilter` assigned.
 *
 * The code is preserved rather than flattened into a generic message
 * because `FIELD_REPORT_REQUIRED`, `TENANT_NOT_VERIFIED` and
 * `ILLEGAL_TRANSITION` mean genuinely different things to a user, and the
 * screen decides how to phrase each.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Raised when the device cannot reach the API at all. */
export class OfflineError extends Error {
  constructor() {
    super(
      'Could not reach House For Rent. Check your connection and try again — nothing was sent.',
    );
    this.name = 'OfflineError';
  }
}

type Json = Record<string, unknown>;

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: Json;
  /** Bearer token. Callers get it from the session, never from user input. */
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * NFR-5: a field connection can hang rather than fail. Without a timeout a
 * tenant on a weak signal watches a spinner forever with no way to retry.
 */
const TIMEOUT_MS = 15000;

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? controller.signal,
    });
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }

  type Envelope = Json & { error?: { code?: string; message?: string } };

  const text = await response.text();
  let parsed: Envelope | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as Envelope;
    } catch {
      // A non-JSON body (a proxy error page, a truncated response on a bad
      // connection) must not crash the caller — it falls through to the
      // status-based message below.
      parsed = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      parsed?.error?.code ?? 'UNKNOWN',
      parsed?.error?.message ?? `Request failed (${response.status}).`,
    );
  }

  return parsed as T;
}

/* ────────────────────────────────────────────────────────────────────────
 * Response shapes. Every money field is a STRING — see the note above.
 * ──────────────────────────────────────────────────────────────────────── */

export type Role = 'tenant' | 'lister' | 'foo' | 'admin';

export interface Caller {
  partyId: string;
  role: Role;
  userAccountId: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** A public search result, with its trust signals as server-asserted data. */
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
  /** Structural, asserted by the server, never client copy (Decision 3). */
  freeForTenants: boolean;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  /** Honest empty state, written by the server (FR-4.4). */
  emptyStateMessage: string | null;
}

/** What the officer confirmed on site — projected from structured fields. */
export interface FieldConfirmed {
  conditionRating: 'excellent' | 'good' | 'fair' | 'poor';
  matchesListing: boolean;
  isAvailable: boolean;
  reportedAt: string;
}

export type DealStatus =
  | 'created'
  | 'tenant_matched'
  | 'agreement_signed'
  | 'escrow_funded'
  | 'move_in_confirmed'
  | 'commission_earned'
  | 'settled'
  | 'closed'
  | 'cancelled'
  | 'refunded'
  | 'dispute_hold';

export interface Deal {
  id: string;
  listingId: string;
  tenantPartyId: string;
  landlordPartyId: string;
  status: DealStatus;
  monthlyRentSnapshot: string | null;
  commissionRateBpSnapshot: number | null;
  commissionAmount: string | null;
  createdAt: string;
}

export interface DealTransition {
  id: string;
  fromStatus: DealStatus | null;
  toStatus: DealStatus;
  reason: string | null;
  occurredAt: string;
}

export interface DealDetail {
  deal: Deal;
  transitions: DealTransition[];
}

export interface Viewing {
  id: string;
  listingId: string;
  tenantPartyId: string;
  conductedByPartyId: string | null;
  scheduledFor: string;
  status: 'requested' | 'scheduled' | 'conducted' | 'no_show' | 'cancelled';
}

/** FR-9.1 — what a landlord is shown before accepting. */
export interface PresentedTerms {
  listingId: string;
  monthlyRent: string;
  commissionRateBp: number;
  commissionIfLet: string;
  clause: {
    version: string;
    commissionTerms: string;
    circumventionClause: string;
    payer: 'landlord';
    tenantPays: false;
  };
  payer: 'landlord';
  tenantPays: false;
  alreadyAccepted: boolean;
}

export interface Listing {
  id: string;
  propertyId: string;
  monthlyRent: string;
  depositAmount: string;
  requiredMonthsUpfront: number;
  verificationState: 'unverified' | 'verified';
  publicationState: 'draft' | 'awaiting_verification' | 'live' | 'rented' | 'withdrawn';
  availabilityStatus: 'available' | 'unavailable';
  availabilityConfirmedAt: string | null;
}
