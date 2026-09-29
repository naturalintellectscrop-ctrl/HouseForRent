/**
 * The API contract: the shapes the backend returns, and the helpers that
 * fetch them.
 *
 * SANDBOX ADAPTATION (worklog.md §D-1): in the real repository this module
 * performs HTTP against the NestJS API (`API_BASE_URL`). Here the web app
 * and the API are one Next.js process, so `apiGet`/`api` dispatch
 * IN-PROCESS to the same service layer the /api/v1 route handlers use —
 * one implementation of the business rules, reached through the same
 * contract shapes. The browser mutations still go over real HTTP
 * (/api/v1/...), so every user journey crosses an API boundary exactly as
 * it does in production.
 *
 * `contract.ts` imports nothing server-only, so client components can take
 * its TYPES; this module resolves sessions and reads the database, so it
 * must never be imported from a client component.
 */
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import {
  publicSearch,
  publicDetail,
  findForLister,
  getListingForLister,
  effectiveCommissionRate,
  freshnessWindowDays,
  listServiceAreaNeighbourhoods,
  adminVerificationQueue,
  type PhotoView,
} from '@/server/listings';
import { findForTenant, findForOfficer, dispatchQueue, getViewingDetail, findIntroductions } from '@/server/viewings';
import { findMandatesForLister, findMandatesForOps } from '@/server/mandates';
import { findForParty, getDealForCaller, listDealsForOps, landlordFinancials } from '@/server/deals';
import { isSaved, listSaved } from '@/server/saved';
import { recentActivity } from '@/server/activity';
import { adminUserDirectory, recentAuditEvents, recentReconciliationChecks } from '@/server/ops';
import { everyPostingBalances } from '@/server/ledger';
import { resolveSession } from '@/server/auth';
import type { SearchResponse } from './contract';

export * from './contract';
export * from './portal';

/**
 * A backend rejection, carrying the code the error filter assigned it. The
 * console shows the backend's own message rather than inventing one, so an
 * officer sees the actual reason (`FIELD_REPORT_REQUIRED`) and not a guess.
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

function unauthenticated(): ApiError {
  return new ApiError(401, 'UNAUTHENTICATED', 'not signed in');
}

// ── shapes (identical to the real API contract) ──────────────────────────

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
  /** Display context so a row can be recognised without a second fetch. */
  tenantName?: string;
  neighbourhood?: string;
  landmarkText?: string;
  bedrooms?: number;
  monthlyRent?: string;
}

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
  /** Display context. */
  tenantName?: string;
  landlordName?: string;
  neighbourhood?: string;
  landmarkText?: string;
  dealId?: string | null;
}

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
  listerName: string;
  listerTier: string | null;
  neighbourhood: string;
  inServiceArea: boolean;
  verificationState: string;
  publicationState: string;
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
  latest: ReconciliationCheck | null;
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
  actorRole?: string | null;
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
  createdByPartyId: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorPartyId: string | null;
  actorName?: string;
  actorRole?: string | null;
  subjectRef: string | null;
  payload: Record<string, unknown> | null;
  occurredAt: string;
}

/** One row of the admin account directory (GET /v1/admin/users). */
export interface DirectoryRow {
  partyId: string;
  displayName: string;
  primaryPhone: string;
  role: string;
  accountStatus: string;
  identityVerified: boolean;
  listingCount: number;
  dealCount: number;
  createdAt: string;
}

export interface PresentedTerms {
  monthlyRent: string;
  commissionRateBp: number;
  commissionIfLet: string;
  clause: { version: string; heading: string; body: string };
  payer: 'landlord';
  tenantPays: false;
  alreadyAccepted: boolean;
  rateVersionId?: string;
}

export interface ViewingDetail {
  viewing: Viewing;
  fieldReport: FieldReport | null;
  introduction: IntroductionRecord | null;
  canConduct: boolean;
  whatIsMissing: string[];
}

// ── resolvers ────────────────────────────────────────────────────────────

async function requireCaller() {
  const session = await resolveSession();
  if (!session) throw unauthenticated();
  return session;
}

async function resolveListingsSearch(sp: URLSearchParams): Promise<SearchResponse> {
  const filters: Parameters<typeof publicSearch>[0] = {};
  const nid = sp.get('neighbourhoodId') ?? sp.get('neighbourhoodIds');
  if (nid) filters.neighbourhoodIds = nid.split(',').filter(Boolean);
  const minRent = sp.get('minRent');
  if (minRent && /^[0-9]+$/.test(minRent)) filters.minRent = BigInt(minRent);
  const maxRent = sp.get('maxRent');
  if (maxRent && /^[0-9]+$/.test(maxRent)) filters.maxRent = BigInt(maxRent);
  const bedrooms = sp.get('bedrooms');
  if (bedrooms && /^[0-9]+$/.test(bedrooms)) filters.bedrooms = parseInt(bedrooms, 10);
  const furnished = sp.get('furnished');
  if (furnished) filters.furnished = furnished;
  const propertyType = sp.get('propertyType');
  if (propertyType) filters.propertyType = propertyType as never;
  const q = sp.get('q');
  if (q) filters.q = q;
  const sort = sp.get('sort');
  if (sort && ['fresh', 'rent_asc', 'rent_desc', 'newest'].includes(sort)) {
    filters.sort = sort as never;
  }
  const limit = sp.get('limit');
  if (limit && /^[0-9]+$/.test(limit)) filters.limit = parseInt(limit, 10);
  const offset = sp.get('offset');
  if (offset && /^[0-9]+$/.test(offset)) filters.offset = parseInt(offset, 10);
  return publicSearch(filters);
}

async function resolveListingDetail(id: string) {
  const detail = await publicDetail(id);
  if (!detail) throw new ApiError(404, 'LISTING_NOT_FOUND', 'that listing does not exist or is not public');
  // The officer's structured verdict on this home, when one exists — the
  // same record the verification queue writes.
  const lastConducted = await db.viewing.findFirst({
    where: { listingId: id, status: 'conducted', fieldReport: { isNot: null } },
    orderBy: { updatedAt: 'desc' },
    include: { fieldReport: true },
  });
  const fieldConfirmed = lastConducted?.fieldReport
    ? {
        conditionRating: lastConducted.fieldReport.conditionRating as 'excellent' | 'good' | 'fair' | 'poor',
        matchesListing: lastConducted.fieldReport.matchesListing,
        isAvailable: lastConducted.fieldReport.isAvailable,
        reportedAt: lastConducted.fieldReport.reportedAt.toISOString(),
      }
    : null;
  // The caller's bookmark state, only when the caller is a signed-in tenant
  // (saving is a tenant surface — anonymous visitors get no toggle).
  const caller = await resolveSession();
  const savedByCaller = caller?.role === 'tenant' ? await isSaved(caller.partyId, id) : null;
  return {
    ...detail,
    neighbourhoodId: '',
    geoLat: null,
    geoLng: null,
    amenities: detail.amenities.map((name, i) => ({ id: String(i), name })),
    fieldConfirmed,
    savedByCaller,
  };
}

async function resolveNeighbourhoods() {
  const rows = await listServiceAreaNeighbourhoods();
  const withCounts = await Promise.all(
    rows.map(async (n) => ({
      id: n.id,
      name: n.name,
      district: n.district,
      parentId: null as string | null,
      parentName: n.district,
      inServiceArea: n.inServiceArea,
      liveListingCount: await db.listing.count({
        where: {
          publicationState: 'live',
          verificationState: 'verified',
          property: { neighbourhoodId: n.id },
        },
      }),
    })),
  );
  return { neighbourhoods: withCounts };
}

async function resolveCommissionRate() {
  const rate = await effectiveCommissionRate();
  return { rateBpOfMonth: rate.rateBp, effectiveFrom: rate.effectiveFrom.toISOString() };
}

async function resolveMyListings() {
  const caller = await requireCaller();
  if (caller.role !== 'lister') throw new ApiError(403, 'FORBIDDEN', 'landlord surface');
  return findForLister(caller.partyId);
}

/** The signed-in tenant's bookmarked homes (QA round: saved listings). */
async function resolveSavedListings() {
  const caller = await requireCaller();
  if (caller.role !== 'tenant') throw new ApiError(403, 'FORBIDDEN', 'tenant surface');
  return listSaved(caller.partyId);
}

/**
 * The signed-in landlord's money position (QA round: /landlord/earnings).
 * The aggregation is the server's — the page renders what arrives and adds
 * no arithmetic of its own (CLAUDE.md §5: the browser never computes
 * business value).
 */
async function resolveLandlordFinancials() {
  const caller = await requireCaller();
  if (caller.role !== 'lister') throw new ApiError(403, 'FORBIDDEN', 'landlord surface');
  return landlordFinancials(caller.partyId);
}

/** The signed-in party's recent real events (QA round: activity feed). */
async function resolveActivityMine() {
  const caller = await requireCaller();
  if (caller.role === 'tenant') return recentActivity(caller.partyId, 'tenant');
  if (caller.role === 'lister') return recentActivity(caller.partyId, 'landlord');
  throw new ApiError(403, 'FORBIDDEN', 'activity is a tenant and landlord surface');
}

/**
 * One mandate row, shared by the lister panel and the ops queue (Task 10-b,
 * F-003 second half). Dates are ISO strings; `listerName`/`listerTier` are
 * filled for the ops queue and null on a lister's own rows (they know who
 * they are). The DECISION note is not on this shape — it lives in the audit
 * trail.
 */
export interface MandateRow {
  id: string;
  state: string;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  property: {
    id: string;
    landmarkText: string;
    neighbourhoodName: string;
    ownerName: string | null;
  };
  listerName: string | null;
  listerTier: string | null;
}

/** The signed-in lister's mandates (Task 10-b: the listing page's panel). */
async function resolveLandlordMandates() {
  const caller = await requireCaller();
  if (caller.role !== 'lister') throw new ApiError(403, 'FORBIDDEN', 'landlord surface');
  return findMandatesForLister(caller.partyId);
}

/** The ops mandate queue for one state (Task 10-b: /ops/mandates). */
async function resolveAdminMandates(sp: URLSearchParams) {
  const caller = await requireCaller();
  if (caller.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'admin surface');
  const state = sp.get('state') ?? 'pending';
  if (state !== 'pending' && state !== 'verified' && state !== 'rejected') {
    throw new ApiError(400, 'VALIDATION', 'state must be pending, verified or rejected');
  }
  return findMandatesForOps({ state });
}

/** The admin's account directory (QA round: /ops/users). */
async function resolveAdminUsers(sp: URLSearchParams) {
  const caller = await requireCaller();
  if (caller.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'admin surface');
  const rows = await adminUserDirectory(sp.get('q') ?? undefined);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

async function resolvePresentedTerms(listingId: string): Promise<PresentedTerms> {
  const caller = await requireCaller();
  if (caller.role !== 'lister') throw new ApiError(403, 'FORBIDDEN', 'landlord surface');
  const mine = await getListingForLister(listingId, caller.partyId);
  if (!mine) throw new ApiError(404, 'LISTING_NOT_FOUND', 'not your listing');

  const rate = await effectiveCommissionRate();
  const monthlyRent = BigInt(mine.monthlyRent);
  const commissionIfLet = (monthlyRent * BigInt(rate.rateBp)) / 10000n;
  return {
    monthlyRent: mine.monthlyRent,
    commissionRateBp: rate.rateBp,
    commissionIfLet: commissionIfLet.toString(),
    clause: {
      version: 'v1',
      heading: 'The circumvention clause',
      body:
        'If the tenant we introduced you to rents this home directly, without going through House For Rent, the full commission becomes payable. Our officers record every introduction with a timestamp and the parties present — that record is what makes this enforceable, and it is why we can keep tenants free and charge you only on success.',
    },
    payer: 'landlord',
    tenantPays: false,
    alreadyAccepted: mine.hasAcceptedAgreement,
    rateVersionId: rate.id,
  };
}

async function resolveListingPhotos(listingId: string) {
  const caller = await requireCaller();
  if (caller.role !== 'lister' && caller.role !== 'admin' && caller.role !== 'foo') {
    throw new ApiError(403, 'FORBIDDEN', 'staff or lister surface');
  }
  const photos = await db.listingPhoto.findMany({
    where: { listingId },
    orderBy: { position: 'asc' },
    include: { asset: true },
  });
  return { photos: photos.map(toContractPhoto) };
}

function toContractPhoto(p: {
  id: string;
  mediaAssetId: string;
  position: number;
  asset: { source: string };
}): PhotoView {
  return {
    id: p.id,
    mediaAssetId: p.mediaAssetId,
    url: `/api/v1/media/${p.mediaAssetId}`,
    caption: null,
    sortOrder: p.position,
    source: p.asset.source,
    isFieldVerified: p.asset.source === 'field_officer',
    isDevelopmentFixture: p.asset.source === 'development_fixture',
  };
}

async function resolveMyViewings() {
  const caller = await requireCaller();
  if (caller.role !== 'tenant') throw new ApiError(403, 'FORBIDDEN', 'tenant surface');
  const rows = await findForTenant(caller.partyId);
  return rows.map((v) => ({
    id: v.id,
    listingId: v.listingId,
    status: v.status as never,
    scheduledFor: v.scheduledFor.toISOString(),
    createdAt: v.scheduledFor.toISOString(),
    officerAssigned: Boolean(v.conductedBy),
    listing: {
      monthlyRent: v.listing.monthlyRent,
      bedrooms: v.listing.bedrooms,
      bathrooms: 0,
      propertyType: v.listing.propertyType,
      neighbourhoodName: v.listing.neighbourhoodName,
      landmarkText: v.listing.landmarkText,
      publicationState: 'live',
    },
    whatHappensNext: v.whatHappensNext,
  }));
}

async function resolveAssignedViewings() {
  const caller = await requireCaller();
  if (caller.role !== 'foo' && caller.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'staff surface');
  const rows = await findForOfficer(caller.partyId);
  return rows.map((v) => ({
    id: v.id,
    listingId: v.listing.id,
    tenantPartyId: '',
    conductedByPartyId: caller.partyId,
    conductedByRole: 'foo' as const,
    scheduledFor: v.scheduledFor.toISOString(),
    status: v.status as never,
    createdAt: v.scheduledFor.toISOString(),
    tenantName: v.tenantName,
    neighbourhood: v.listing.neighbourhoodName,
    landmarkText: v.listing.landmarkText,
    bedrooms: v.listing.bedrooms,
    monthlyRent: v.listing.monthlyRent,
  }));
}

async function resolveDispatchQueue(): Promise<DispatchQueue> {
  const caller = await requireCaller();
  if (caller.role !== 'admin' && caller.role !== 'foo') throw new ApiError(403, 'FORBIDDEN', 'staff surface');

  const rows = await dispatchQueue();
  const windowDays = await freshnessWindowDays();
  const staleCutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const dispatchRows: DispatchRow[] = [];
  for (const row of rows) {
    const listing = await db.listing.findUnique({
      where: { id: row.listingId },
      include: { property: { include: { neighbourhood: true } } },
    });
    if (!listing) continue;
    const blockedBy: string[] = [];
    if (!listing.property.neighbourhood.inServiceArea) blockedBy.push('outside_service_area');
    if (listing.verificationState !== 'verified') blockedBy.push('field_verification');
    dispatchRows.push({
      viewing: {
        id: row.id,
        listingId: row.listingId,
        tenantPartyId: '',
        conductedByPartyId: null,
        conductedByRole: 'foo',
        scheduledFor: row.scheduledFor.toISOString(),
        status: 'requested',
        createdAt: row.requestedAt.toISOString(),
        tenantName: row.tenantName,
        neighbourhood: row.neighbourhood,
        landmarkText: row.landmarkText,
        bedrooms: row.bedrooms,
        monthlyRent: row.monthlyRent,
      },
      listingId: row.listingId,
      neighbourhood: row.neighbourhood,
      inServiceArea: listing.property.neighbourhood.inServiceArea,
      blockedBy,
    });
  }
  void staleCutoff;

  const officers = (await db.userAccount.findMany({
    where: { role: 'foo', status: 'active' },
    include: { party: { select: { displayName: true } } },
  })).map(async (a) => ({
    partyId: a.partyId,
    displayName: a.party.displayName,
    assignedCount: await db.viewing.count({
      where: { conductedByPartyId: a.partyId, status: 'scheduled' },
    }),
  }));

  return {
    total: dispatchRows.length,
    rows: dispatchRows,
    officers: await Promise.all(officers),
  };
}

async function resolveViewingDetail(viewingId: string): Promise<ViewingDetail> {
  const caller = await requireCaller();
  if (caller.role !== 'foo' && caller.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'staff surface');
  const detail = await getViewingDetail(viewingId);
  if (detail.conductedByName && caller.role === 'foo' && detail.conductedByName !== caller.displayName) {
    // Assigned to another officer: an admin may look, an officer may not.
    throw new ApiError(403, 'NOT_ASSIGNED_OFFICER', 'this visit is assigned to another officer');
  }
  const fieldReport: FieldReport | null = detail.fieldReport
    ? {
        id: '',
        viewingId: detail.id,
        conditionRating: detail.fieldReport.conditionRating as never,
        matchesListing: detail.fieldReport.matchesListing,
        isAvailable: detail.fieldReport.isAvailable,
        issuesText: detail.fieldReport.issuesText,
        timingNote: detail.fieldReport.timingNote,
        mediaAssetIds: [],
        reportedAt: detail.fieldReport.reportedAt.toISOString(),
      }
    : null;
  const introduction = detail.introductionRecord
    ? {
        id: detail.introductionRecord.id,
        viewingId: detail.id,
        tenantPartyId: '',
        listingId: detail.listing.id,
        landlordPartyId: detail.listing.listerPartyId,
        fooPartyId: caller.partyId,
        introducedAt: detail.introductionRecord.introducedAt.toISOString(),
      }
    : null;
  const whatIsMissing: string[] = [];
  if (!fieldReport) whatIsMissing.push('field report');
  return {
    viewing: {
      id: detail.id,
      listingId: detail.listing.id,
      tenantPartyId: '',
      conductedByPartyId: null,
      conductedByRole: 'foo',
      scheduledFor: detail.scheduledFor.toISOString(),
      status: detail.status as never,
      createdAt: detail.scheduledFor.toISOString(),
      tenantName: detail.tenantName,
      neighbourhood: detail.listing.neighbourhoodName,
      landmarkText: detail.listing.landmarkText,
      bedrooms: detail.listing.bedrooms,
      monthlyRent: detail.listing.monthlyRent,
    },
    fieldReport,
    introduction,
    canConduct: detail.status === 'scheduled' && Boolean(fieldReport),
    whatIsMissing,
  };
}

async function resolveIntroductions() {
  const caller = await requireCaller();
  const rows = await findIntroductions(
    caller.role === 'foo' ? { fooPartyId: caller.partyId } : {},
  );
  return rows.map((r) => {
    let dealId: string | null = null;
    void dealId;
    return {
      id: r.id,
      viewingId: r.viewingId,
      tenantPartyId: r.tenantPartyId,
      listingId: r.listingId,
      landlordPartyId: r.landlordPartyId,
      fooPartyId: r.fooPartyId,
      introducedAt: r.introducedAt.toISOString(),
      tenantName: r.tenantParty.displayName,
      landlordName: r.landlordParty.displayName,
      neighbourhood: r.listing.property.neighbourhood.name,
      landmarkText: r.listing.property.landmarkText,
      dealId,
    };
  });
}

/**
 * TASK 7-b (additive): the introduction EVIDENCE page filters by party id
 * and listing id in its query string; the unfiltered resolver above cannot
 * honour that. This one applies the same filters the real API accepted
 * (tenantPartyId, listingId via the service's where-clause; landlordPartyId
 * against the included relation). Its routing line sits immediately before
 * the unfiltered introductions line — order matters, nothing existing was
 * moved or rewritten, and the mapping is repeated rather than shared for
 * exactly that reason.
 */
function hasIntroductionFilters(sp: URLSearchParams): boolean {
  return (
    sp.has('tenantPartyId') || sp.has('landlordPartyId') || sp.has('listingId')
  );
}

async function resolveIntroductionsFiltered(sp: URLSearchParams) {
  const caller = await requireCaller();
  if (caller.role !== 'foo' && caller.role !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN', 'staff surface');
  }
  const rows = await findIntroductions({
    ...(caller.role === 'foo' ? { fooPartyId: caller.partyId } : {}),
    tenantPartyId: sp.get('tenantPartyId') ?? undefined,
    listingId: sp.get('listingId') ?? undefined,
  });
  const landlordPartyId = sp.get('landlordPartyId');
  return rows
    .filter((r) => !landlordPartyId || r.landlordPartyId === landlordPartyId)
    .map((r) => ({
      id: r.id,
      viewingId: r.viewingId,
      tenantPartyId: r.tenantPartyId,
      listingId: r.listingId,
      landlordPartyId: r.landlordPartyId,
      fooPartyId: r.fooPartyId,
      introducedAt: r.introducedAt.toISOString(),
      tenantName: r.tenantParty.displayName,
      landlordName: r.landlordParty.displayName,
      neighbourhood: r.listing.property.neighbourhood.name,
      landmarkText: r.listing.property.landmarkText,
      dealId: null,
    }));
}

/** Viewing activity on the landlord's own listings (read-only; ops dispatches). */
async function resolveListerViewings() {
  const caller = await requireCaller();
  if (caller.role !== 'lister') throw new ApiError(403, 'FORBIDDEN', 'landlord surface');
  const { findViewingsForLister } = await import('@/server/viewings');
  return findViewingsForLister(caller.partyId);
}

async function resolveIdentityMe() {
  const caller = await requireCaller();
  const consent = await db.consentRecord.findFirst({
    where: { partyId: caller.partyId },
    orderBy: { acceptedAt: 'desc' },
  });
  return {
    partyId: caller.partyId,
    displayName: caller.displayName,
    identityVerified: caller.verificationState === 'verified',
    screeningState: caller.verificationState,
    screeningModulesRun: ['identity'],
    consentRecordedAt: consent?.acceptedAt.toISOString() ?? null,
    consentPolicyVersion: consent?.version ?? null,
  };
}

async function resolvePartyDeals() {
  const caller = await requireCaller();
  if (caller.role === 'foo') return [];
  return findForParty(caller.partyId);
}

async function resolveDealDetail(dealId: string): Promise<DealDetail> {
  const caller = await requireCaller();
  const d = await getDealForCaller(dealId, caller.partyId, caller.role);
  return {
    deal: {
      id: d.id,
      status: d.status,
      listingId: d.listing.id,
      tenantPartyId: d.parties.tenant.partyId,
      landlordPartyId: d.parties.landlord.partyId,
      introductionRecordId: null,
      agreementId: null,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    },
    transitions: d.transitions.map((t) => ({
      id: t.id,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      actorPartyId: t.actorPartyId ?? '',
      actorRole: t.actorRole,
      reason: t.reason,
      occurredAt: t.createdAt.toISOString(),
    })),
    listing: d.listing,
    property: d.property,
    parties: d.parties,
    financial: d.financials,
    availableActions: d.availableActions,
  };
}

/** The launch gate: verified-fresh live inventory against the configured bar. */
async function resolveLaunchGate(): Promise<LaunchGate> {
  const windowDays = await freshnessWindowDays();
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const gateParam = await db.configParameter.findUnique({ where: { key: 'launch_gate_listings' } });
  const gate = gateParam ? parseInt(gateParam.value, 10) || 12 : 12;

  const live = await db.listing.count({
    where: {
      publicationState: 'live',
      verificationState: 'verified',
      availabilityConfirmedAt: { gte: cutoff },
      property: { neighbourhood: { inServiceArea: true } },
    },
  });
  const staleExcluded = await db.listing.count({
    where: {
      publicationState: 'live',
      verificationState: 'verified',
      property: { neighbourhood: { inServiceArea: true } },
    },
  });

  return {
    gate,
    qualifying: live,
    staleExcluded,
    freshnessWindowDays: windowDays,
    gateMet: live >= gate,
    shortfall: Math.max(0, gate - live),
    asOf: new Date().toISOString(),
  };
}

async function resolveVerificationQueue(): Promise<VerificationQueue> {
  const caller = await requireCaller();
  if (caller.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'admin surface');
  const rows = await adminVerificationQueue();
  return { total: rows.length, rows };
}

async function resolveDealStates(): Promise<DealStates> {
  const rows = await listDealsForOps();
  const withCommission = await Promise.all(rows.map(async (r) => {
    const deal = await db.deal.findUnique({ where: { id: r.id }, select: { commissionAmount: true } });
    return {
      id: r.id,
      status: r.status,
      neighbourhood: r.neighbourhood,
      tenantName: r.tenantName,
      landlordName: r.landlordName,
      monthlyRent: r.monthlyRent,
      commissionAmount: deal?.commissionAmount?.toString() ?? null,
      createdAt: r.updatedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }));
  const distribution: Record<string, number> = {};
  for (const row of withCommission) {
    distribution[row.status] = (distribution[row.status] ?? 0) + 1;
  }
  return { distribution, total: withCommission.length, rows: withCommission };
}

function toAuditEvents(rows: Awaited<ReturnType<typeof recentAuditEvents>>): AuditEvent[] {
  return rows.map((r) => ({
    id: r.id,
    eventType: r.action,
    actorPartyId: null,
    actorName: r.actorName,
    actorRole: r.actorRole,
    subjectRef: r.entityId,
    payload: r.detail,
    occurredAt: r.createdAt.toISOString(),
  }));
}

async function resolveReconciliation(): Promise<Reconciliation> {
  const history = await recentReconciliationChecks();
  const checks: ReconciliationCheck[] = history.map((c) => ({
    id: c.id,
    runAt: c.runAt.toISOString(),
    ledgerBalance: c.ledgerBalance.toString(),
    pspBalance: c.pspBalance.toString(),
    isReconciled: c.isReconciled,
    discrepancyNote: c.discrepancyNote,
  }));
  return {
    latest: checks[0] ?? null,
    internallyConsistent: await everyPostingBalances(),
    history: checks,
  };
}

async function resolveConfigVersions(key: string): Promise<ConfigVersion[]> {
  const param = await db.configParameter.findUnique({ where: { key }, include: { versions: true } });
  if (!param) return [];
  return param.versions.map((v) => ({
    id: v.id,
    parameterId: v.parameterId,
    value: v.value,
    effectiveFrom: v.createdAt.toISOString(),
    createdByPartyId: v.changedBy,
    createdAt: v.createdAt.toISOString(),
  }));
}

async function resolveCommissionRates() {
  const rows = await db.commissionRateVersion.findMany({ orderBy: { effectiveFrom: 'desc' } });
  return rows.map((r) => ({ id: r.id, rateBp: r.rateBp, effectiveFrom: r.effectiveFrom.toISOString() }));
}

// ── the dispatcher ───────────────────────────────────────────────────────

type Resolver = () => Promise<unknown>;

/**
 * Resolves an API path in-process. Route ORDER MATTERS: `/v1/listings/mine`
 * must be tried before `/v1/listings/:id`, or "mine" would be read as an id.
 */
function resolverFor(path: string, authenticated: boolean): Resolver {
  const u = new URL(path, 'http://in-process');
  const parts = u.pathname.split('/').filter(Boolean); // ['v1', ...]

  // public reads
  if (parts[1] === 'listings' && parts.length === 2) return () => resolveListingsSearch(u.searchParams);
  if (parts[1] === 'listings' && parts[2] === 'mine') return () => resolveMyListings();
  // saved must precede /:id — same ordering rule as /mine above.
  if (parts[1] === 'listings' && parts[2] === 'saved') return () => resolveSavedListings();
  if (parts[1] === 'listings' && parts.length === 3) return () => resolveListingDetail(parts[2]);
  if (parts[1] === 'listings' && parts[3] === 'agreement') return () => resolvePresentedTerms(parts[2]);
  if (parts[1] === 'listings' && parts[3] === 'photos' && parts.length === 4) return () => resolveListingPhotos(parts[2]);
  if (parts[1] === 'neighbourhoods') return () => resolveNeighbourhoods();
  if (parts[1] === 'commission-rate') return () => resolveCommissionRate();

  // authenticated reads
  if (!authenticated) return () => { throw unauthenticated(); };
  if (parts[1] === 'viewings' && parts[2] === 'mine') return () => resolveMyViewings();
  if (parts[1] === 'viewings' && parts[2] === 'assigned' && parts[3] === 'me') return () => resolveAssignedViewings();
  if (parts[1] === 'viewings' && parts[2] === 'dispatch-queue') return () => resolveDispatchQueue();
  if (parts[1] === 'viewings' && parts[2] === 'for-lister') return () => resolveListerViewings();
  // TASK 7-b (additive): filtered evidence lookup — must precede the
  // unfiltered introductions route below.
  if (parts[1] === 'viewings' && parts[2] === 'introductions' && hasIntroductionFilters(u.searchParams)) {
    return () => resolveIntroductionsFiltered(u.searchParams);
  }
  if (parts[1] === 'viewings' && parts[2] === 'introductions') return () => resolveIntroductions();
  if (parts[1] === 'viewings' && parts.length === 3) return () => resolveViewingDetail(parts[2]);
  if (parts[1] === 'identity' && parts[2] === 'me') return () => resolveIdentityMe();
  if (parts[1] === 'activity' && parts[2] === 'mine') return () => resolveActivityMine();
  if (parts[1] === 'deals' && parts.length === 2) return () => resolvePartyDeals();
  if (parts[1] === 'deals' && parts.length === 3) return () => resolveDealDetail(parts[2]);
  if (parts[1] === 'landlord' && parts[2] === 'financials') return () => resolveLandlordFinancials();
  // Task 10-b (additive): the mandate flow's reads. The decision POST is a
  // mutation and belongs to its route handler (which calls the service
  // directly), never to this GET-only dispatcher.
  if (parts[1] === 'landlord' && parts[2] === 'mandates') return () => resolveLandlordMandates();
  if (parts[1] === 'admin' && parts[2] === 'mandates') return () => resolveAdminMandates(u.searchParams);
  if (parts[1] === 'admin' && parts[2] === 'launch-gate') return () => resolveLaunchGate();
  if (parts[1] === 'admin' && parts[2] === 'verification-queue') return () => resolveVerificationQueue();
  if (parts[1] === 'admin' && parts[2] === 'users') return () => resolveAdminUsers(u.searchParams);
  // TASK 7-b (additive): the deal queue's "Show only" filter passes ?status=
  // — must precede the unfiltered admin deals route below. The distribution
  // stays whole (it is the shape of the whole book); only the rows narrow.
  if (parts[1] === 'admin' && parts[2] === 'deals' && u.searchParams.has('status')) {
    return async () => {
      const status = u.searchParams.get('status') ?? '';
      const states = await resolveDealStates();
      const rows = states.rows.filter((r) => r.status === status);
      return { ...states, total: rows.length, rows };
    };
  }
  if (parts[1] === 'admin' && parts[2] === 'deals') return () => resolveDealStates();
  if (parts[1] === 'admin' && parts[2] === 'reconciliation') return () => resolveReconciliation();
  if (parts[1] === 'admin' && parts[2] === 'audit' && parts.length === 4) {
    return async () => toAuditEvents(await recentAuditEvents(50)).filter((e) => e.subjectRef === parts[3]);
  }
  if (parts[1] === 'admin' && parts[2] === 'audit') return async () => toAuditEvents(await recentAuditEvents(100));
  if (parts[1] === 'admin' && parts[2] === 'commission-rates') return () => resolveCommissionRates();
  if (parts[1] === 'admin' && parts[2] === 'config' && parts[4] === 'versions') return () => resolveConfigVersions(parts[3]);

  throw new ApiError(404, 'UNKNOWN_PATH', `no in-process resolver for GET ${path}`);
}

/**
 * An unauthenticated GET against the public API. The marketplace is
 * browsable without an account (Decision 3).
 */
export async function apiGet<T>(path: string, _opts: { revalidate?: number } = {}): Promise<T> {
  return resolverFor(path, false)() as Promise<T>;
}

/**
 * Authenticated GET, in-process. Runs the role check here that the API's
 * guards would run — same rules, one implementation.
 *
 * MUTATIONS DO NOT BELONG HERE: any POST/PUT goes through `postJson()`
 * from '@/lib/client' in a CLIENT component, over real HTTP to /api/v1 —
 * this module is server-only (it imports the database), and every state
 * change must cross an API boundary.
 */
export async function api<T>(path: string, init?: { method?: string; body?: Record<string, unknown> }): Promise<T> {
  const method = init?.method ?? 'GET';
  if (method !== 'GET') {
    throw new ApiError(
      500,
      'MUTATION_NOT_ALLOWED',
      'server-side mutations must go through /api/v1 route handlers via postJson()',
    );
  }
  return resolverFor(path, true)() as Promise<T>;
}

// ── session helpers re-exported for pages ────────────────────────────────

export { resolveSession };
export async function requirePortalRole(allowed: readonly string[], returnTo?: string) {
  const session = await resolveSession();
  if (!session) redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : '/login');
  else if (!allowed.includes(session.role)) redirect('/login');
  return session;
}
