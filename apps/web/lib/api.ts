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

/**
 * An unauthenticated GET against the public API.
 *
 * The marketplace is browsable without an account (Decision 3), so the home
 * page, the search page and every property page use this. It runs
 * server-side like every other call here, which keeps the API base out of
 * the client bundle and lets Next cache the render.
 */
export async function apiGet<T>(
  path: string,
  opts: { revalidate?: number } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    // The public feed is not per-user, so a short shared cache is safe and
    // spares the API a query per visitor. `0` opts a page out entirely.
    ...(opts.revalidate === 0
      ? { cache: 'no-store' as const }
      : { next: { revalidate: opts.revalidate ?? 30 } }),
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

/** Unauthenticated call — login and registration only. */
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
  /** When the tenant asked — distinct from the slot they asked for. */
  createdAt: string;
}

/**
 * The dispatcher's queue (F-002).
 *
 * `inServiceArea` and `blockedBy` arrive SERVER-COMPUTED, from the same
 * neighbourhood flag `assign()` reads. The console renders that judgement
 * rather than deriving its own — a second copy would be the wrong one the
 * moment the two disagreed.
 */
export interface DispatchRow {
  viewing: Viewing;
  listingId: string;
  neighbourhood: string;
  inServiceArea: boolean;
  blockedBy: string[];
}

export interface AssignableOfficer {
  partyId: string;
  displayName: string;
  /** Visits already on their board — dispatch should not be blind to load. */
  assignedCount: number;
}

export interface DispatchQueue {
  total: number;
  rows: DispatchRow[];
  officers: AssignableOfficer[];
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

export interface DealRow {
  id: string;
  status: string;
  neighbourhood: string;
  tenantName: string;
  landlordName: string;
  monthlyRent: string;
  commissionAmount: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealStates {
  distribution: Record<string, number>;
  total: number;
  rows: DealRow[];
}

/**
 * ── The deal detail contract (F-007) ──
 *
 * `availableActions` is the server's answer to "what may this caller do to
 * this deal right now", derived from the real transition graph and the real
 * `@Roles()` decorators. This console RENDERS it.
 *
 * There is deliberately no `DealStatus → actions` map anywhere in this app.
 * A second copy of the transition graph here would be a second copy of the
 * Move-In Guarantee — and the wrong one the moment it drifted, either by
 * offering a settlement the server refuses or, worse, hiding one it would
 * have allowed.
 */
export interface DealActionField {
  name: string;
  kind: 'shillings' | 'text';
  label: string;
  hint?: string;
  required: boolean;
}

export interface AvailableDealAction {
  action: string;
  label: string;
  /** Plain-language consequence, written server-side. Shown before acting. */
  consequence: string;
  reversible: boolean;
  movesMoney: boolean;
  fields: DealActionField[];
}

/** Every figure computed server-side from the ledger. None derived here. */
export interface DealFinancial {
  expectedUpfront: string;
  monthlyRentSnapshot: string | null;
  commissionRateBpSnapshot: number | null;
  commissionAmount: string | null;
  heldInEscrow: string;
  owedToLandlord: string;
  commissionRecognised: string;
  funded: string;
  releasedToLandlord: string;
  refunded: string;
  escrowDischarged: boolean;
}

export interface DealTransitionRow {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorPartyId: string;
  reason: string | null;
  occurredAt: string;
}

export interface DealDetail {
  deal: {
    id: string;
    status: string;
    listingId: string;
    tenantPartyId: string;
    landlordPartyId: string;
    introductionRecordId: string | null;
    agreementId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  transitions: DealTransitionRow[];
  listing: {
    id: string;
    monthlyRent: string;
    requiredMonthsUpfront: number;
    depositAmount: string;
    publicationState: string;
    availabilityStatus: string;
    verificationState: string;
  };
  property: {
    id: string;
    propertyType: string;
    bedrooms: number;
    bathrooms: number;
    furnished: string;
    landmarkText: string | null;
    neighbourhood: string;
    inServiceArea: boolean;
  };
  parties: {
    tenant: { partyId: string; displayName: string };
    landlord: { partyId: string; displayName: string };
  };
  financial: DealFinancial;
  availableActions: AvailableDealAction[];
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

export * from './contract';
