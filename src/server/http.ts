/**
 * The HTTP edge for /api/v1 — session resolution, role guards, and the
 * mapping from domain errors to status codes. The ONLY place that knows
 * about HTTP; services throw domain errors with the same names the real
 * NestJS API uses.
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveSession, type ResolvedSession } from './auth';
import type { AuthRole } from './domain';

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

export async function requireSession(): Promise<ResolvedSession> {
  const session = await resolveSession();
  if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'not signed in');
  return session;
}

export async function requireRole(allowed: readonly AuthRole[]): Promise<ResolvedSession> {
  const session = await requireSession();
  if (!allowed.includes(session.role)) {
    throw new ApiError(403, 'FORBIDDEN', 'your role cannot perform this action');
  }
  return session;
}

export function jsonError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  const map: Record<string, { status: number; code: string }> = {
    DealNotFoundError: { status: 404, code: 'DEAL_NOT_FOUND' },
    ViewingNotFoundError: { status: 404, code: 'VIEWING_NOT_FOUND' },
    IllegalViewingTransitionError: { status: 409, code: 'ILLEGAL_VIEWING_TRANSITION' },
    NotYourViewingError: { status: 403, code: 'NOT_YOUR_VIEWING' },
    IntroductionRecordNotFoundError: { status: 404, code: 'INTRODUCTION_NOT_FOUND' },
    IllegalTransitionError: { status: 409, code: 'ILLEGAL_TRANSITION' },
    SnapshotImmutableError: { status: 409, code: 'SNAPSHOT_IMMUTABLE' },
    ListingTermsChangedError: { status: 422, code: 'LISTING_TERMS_CHANGED' },
    AmountNotAuthoritativeError: { status: 422, code: 'AMOUNT_NOT_AUTHORITATIVE' },
    NothingHeldError: { status: 409, code: 'NOTHING_HELD' },
    DealAlreadyExistsError: { status: 409, code: 'DEAL_ALREADY_EXISTS' },
    MissingListingAgreementError: { status: 409, code: 'MISSING_LISTING_AGREEMENT' },
    MissingIntroductionRecordError: { status: 409, code: 'MISSING_INTRODUCTION_RECORD' },
    NotTheIntroducingOfficerError: { status: 403, code: 'NOT_THE_INTRODUCING_OFFICER' },
    ViewingNotConductedError: { status: 409, code: 'VIEWING_NOT_CONDUCTED' },
    TenantNotVerifiedError: { status: 409, code: 'TENANT_NOT_VERIFIED' },
    FieldReportRequiredError: { status: 409, code: 'FIELD_REPORT_REQUIRED' },
    NotAssignedOfficerError: { status: 403, code: 'NOT_ASSIGNED_OFFICER' },
    NotYourListingError: { status: 403, code: 'NOT_YOUR_LISTING' },
    NeighbourhoodNotFoundError: { status: 404, code: 'NEIGHBOURHOOD_NOT_FOUND' },
    ListingNotFoundError: { status: 404, code: 'LISTING_NOT_FOUND' },
    UnverifiedListingError: { status: 409, code: 'UNVERIFIED_LISTING' },
    OutsideServiceAreaError: { status: 409, code: 'OUTSIDE_SERVICE_AREA' },
    MissingMandateError: { status: 409, code: 'MISSING_MANDATE' },
    PropertyNotFoundError: { status: 404, code: 'PROPERTY_NOT_FOUND' },
    NotYourPropertyError: { status: 403, code: 'NOT_YOUR_PROPERTY' },
    MandateNotNeededError: { status: 422, code: 'MANDATE_NOT_NEEDED' },
    MandateNotFoundError: { status: 404, code: 'MANDATE_NOT_FOUND' },
    MandateAlreadyDecidedError: { status: 409, code: 'MANDATE_ALREADY_DECIDED' },
    InvalidMandateDecisionError: { status: 422, code: 'INVALID_MANDATE_DECISION' },
    StaffRoleError: { status: 400, code: 'STAFF_ROLE_INVALID' },
    InvalidAmountError: { status: 400, code: 'INVALID_AMOUNT' },
    EmptyPostingError: { status: 500, code: 'EMPTY_POSTING' },
    UnbalancedPostingError: { status: 500, code: 'UNBALANCED_POSTING' },
  };
  const name = err instanceof Error ? err.name : '';
  const mapped = map[name];
  if (mapped) {
    return NextResponse.json(
      { error: { code: mapped.code, message: err instanceof Error ? err.message : 'request failed' } },
      { status: mapped.status },
    );
  }
  console.error('[api] unhandled error:', err);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'something went wrong on our side' } },
    { status: 500 },
  );
}

/** Wraps a handler with the error mapping. */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      return jsonError(err);
    }
  };
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Parses an integer-shillings string. Money never passes through a number. */
export function parseShillings(raw: unknown, field: string): bigint {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new ApiError(400, 'VALIDATION', `${field} must be an integer amount of shillings`);
  }
  const cleaned = String(raw).replace(/[\s,]/g, '');
  if (!/^[0-9]+$/.test(cleaned)) {
    throw new ApiError(400, 'VALIDATION', `${field} must be a whole number of shillings`);
  }
  return BigInt(cleaned);
}

export function requireString(body: Record<string, unknown>, field: string, opts: { optional?: boolean } = {}): string {
  const raw = body[field];
  if (typeof raw === 'string' && raw.trim().length > 0) return raw.trim();
  if (opts.optional) return '';
  throw new ApiError(400, 'VALIDATION', `${field} is required`);
}

export function parseDate(body: Record<string, unknown>, field: string): Date {
  const raw = body[field];
  const d = raw ? new Date(String(raw)) : null;
  if (!d || Number.isNaN(d.getTime())) {
    throw new ApiError(400, 'VALIDATION', `${field} must be a valid date`);
  }
  return d;
}
