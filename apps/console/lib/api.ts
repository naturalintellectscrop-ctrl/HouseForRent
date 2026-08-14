import { cookies } from 'next/headers';

/**
 * The only place this console talks to the backend.
 *
 * ── This console is a THIN CLIENT ──
 * Technical Architecture §7: "all money, state, verification, and commission
 * logic is server-side ... It renders server state and issues intent."
 * Nothing in this app computes a commission, decides whether a viewing may
 * be conducted, or judges whether a listing is stale. It POSTs intent and
 * renders whatever the backend says. Every rule that matters is enforced
 * there, by the guards and services of Stages 0–7 — a rule re-implemented
 * here would be a second copy free to drift, and a copy an attacker can
 * rewrite.
 */

export const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3000';

export const ACCESS_COOKIE = 'hfr_access';
export const REFRESH_COOKIE = 'hfr_refresh';
export const ROLE_COOKIE = 'hfr_role';

/**
 * A backend rejection, carrying the code the DomainExceptionFilter assigned
 * it. The console shows the backend's own message rather than inventing
 * one, so an officer sees the actual reason (`FIELD_REPORT_REQUIRED`) and
 * not a guess.
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

type Json = Record<string, unknown>;

async function parse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Json;
  } catch {
    return { raw: text };
  }
}

/** Unauthenticated call — login only. */
export async function apiPublic<T>(
  path: string,
  body: Json,
  method = 'POST',
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const parsed = (await parse(res)) as
    | (Json & { error?: { code?: string; message?: string } })
    | null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? 'UNKNOWN',
      parsed?.error?.message ?? `request failed (${res.status})`,
    );
  }
  return parsed as T;
}

/**
 * Authenticated call. The bearer token is read from an httpOnly cookie the
 * browser cannot script-read, and is attached SERVER-SIDE — it never
 * reaches the client bundle, so an XSS on this console cannot exfiltrate a
 * field officer's session.
 */
export async function api<T>(
  path: string,
  init?: { method?: string; body?: Json },
): Promise<T> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'not signed in');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });

  const parsed = (await parse(res)) as
    | (Json & { error?: { code?: string; message?: string } })
    | null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? 'UNKNOWN',
      parsed?.error?.message ?? `request failed (${res.status})`,
    );
  }
  return parsed as T;
}

/** ── Shapes the backend returns. Money always arrives as a STRING (API Spec §2). */

export interface Viewing {
  id: string;
  listingId: string;
  tenantPartyId: string;
  conductedByPartyId: string | null;
  conductedByRole: 'foo';
  scheduledFor: string;
  status: 'requested' | 'scheduled' | 'conducted' | 'no_show' | 'cancelled';
}

export interface FieldReport {
  id: string;
  viewingId: string;
  conditionRating: 'excellent' | 'good' | 'fair' | 'poor';
  matchesListing: boolean;
  isAvailable: boolean;
  issuesText: string | null;
  timingNote: string | null;
  mediaAssetIds: string[];
  reportedAt: string;
}

export interface IntroductionRecord {
  id: string;
  viewingId: string;
  tenantPartyId: string;
  listingId: string;
  landlordPartyId: string;
  fooPartyId: string;
  introducedAt: string;
}

export interface MediaVariant {
  name: 'thumb' | 'low' | 'standard';
  variantRef: string;
  byteSize: number;
}

/** ── Admin observability (PRD E10). ──
 *
 * Note that `gateMet`, `shortfall`, `blockedBy` and `isReconciled` all
 * arrive as SERVER-COMPUTED fields. This console renders them; it does not
 * re-derive them. A dashboard that computed "is the gate met?" locally
 * would be a second implementation of a business rule, and the wrong one
 * the moment the two disagreed (Technical Architecture §7).
 */

export interface LaunchGate {
  gate: number;
  qualifying: number;
  staleExcluded: number;
  freshnessWindowDays: number;
  gateMet: boolean;
  shortfall: number;
  asOf: string;
}

export interface QueueRow {
  listingId: string;
  propertyId: string;
  listerPartyId: string;
  listerTier: string | null;
  neighbourhood: string;
  inServiceArea: boolean;
  verificationState: string;
  mandateState: string | null;
  hasAcceptedAgreement: boolean;
  blockedBy: string[];
  createdAt: string;
}

export interface VerificationQueue {
  total: number;
  rows: QueueRow[];
}

export interface ReconciliationCheck {
  id: string;
  runAt: string;
  /** Money, so it arrives as a string (API Spec §2). */
  ledgerBalance: string;
  pspBalance: string;
  isReconciled: boolean;
  discrepancyNote: string | null;
}

export interface Reconciliation {
  latest: ReconciliationCheck;
  /** The ledger agreeing with ITSELF — a different problem from the above. */
  internallyConsistent: boolean;
  history: ReconciliationCheck[];
}

export interface DealStates {
  distribution: Record<string, number>;
  total: number;
}

export interface ConfigVersion {
  id: string;
  parameterId: string;
  value: unknown;
  effectiveFrom: string;
  createdByPartyId: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorPartyId: string;
  subjectRef: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}
