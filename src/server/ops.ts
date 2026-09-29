/**
 * Identity verification, staff provisioning, audit reads and reconciliation
 * — the admin/ops module.
 *
 * The identity provider here is the SANDBOX MOCK, exactly as in the real
 * repo (behind IdentityProvider there). Every surface that calls it must
 * SAY it is a mock — the product sells verification and cannot overstate
 * its own. Behaviour: the V1 baseline is identity-only screening (Decision
 * 10); ability to pay is evidenced by the escrow flow, never by documents.
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { everyPostingBalances } from './ledger';
import { AUTH_ROLES, LISTER_TIERS, type AuthRole, type ListerTier } from './domain';
import { ApiError } from './http';
import { NeighbourhoodNotFoundError } from './listings';

// ── identity (MOCK provider) ─────────────────────────────────────────────

export const IDENTITY_PROVIDER_IS_MOCK = true;

export interface MockIdentityCheck {
  /** A National Identification Number (NIN) as issued in Uganda: CM/CF + 13 digits. */
  nin: string;
  fullName: string;
}

/**
 * The mock check: structural validation + a name match against the account.
 * It verifies NOTHING about the real world and says so.
 *
 * Task 14: the outcome logic now lives in ONE place (`mockIdentityOutcome`)
 * because operations gained the ability to run the same check on an
 * account's behalf — the two paths must never disagree about what passes.
 */
function mockIdentityOutcome(nin: string, fullName: string, displayName: string): 'verified' | 'failed' {
  const normalised = nin.trim().toUpperCase();
  return /^(CM|CF)[0-9A-Z]{12}$/.test(normalised) &&
    fullName.trim().toLowerCase() === displayName.trim().toLowerCase()
    ? 'verified'
    : 'failed';
}

async function recordIdentityCheck(params: {
  partyId: string;
  displayName: string;
  method: string;
  nin: string;
  fullName: string;
  /** Audit actor: the subject themselves (self-service) or the admin (ops run). */
  actorPartyId: string;
  actorRole: AuthRole | null;
  /** Set when operations ran the check, so the trail can tell the two apart forever. */
  byOperations?: boolean;
}) {
  const state = mockIdentityOutcome(params.nin, params.fullName, params.displayName);

  const record = await db.identityVerification.create({
    data: {
      partyId: params.partyId,
      method: params.method,
      state,
      reference: createHash('sha256').update(params.nin.trim().toUpperCase()).digest('hex').slice(0, 16),
      verifiedAt: state === 'verified' ? new Date() : null,
    },
  });

  if (state === 'verified') {
    // Completing identity activation makes the account active.
    const party = await db.party.findUnique({ where: { id: params.partyId } });
    if (party && party.status === 'pending_verification') {
      await db.party.update({ where: { id: params.partyId }, data: { status: 'active' } });
      await db.userAccount.updateMany({ where: { partyId: params.partyId }, data: { status: 'active' } });
    }
  }

  await db.auditEvent.create({
    data: {
      actorPartyId: params.actorPartyId,
      ...(params.actorRole ? { actorRole: params.actorRole } : {}),
      action: 'identity_verification',
      entityType: 'identity_verification',
      entityId: record.id,
      detail: JSON.stringify({
        state,
        method: params.method,
        provider: 'sandbox-mock',
        ...(params.byOperations ? { by: 'operations' } : {}),
      }),
    },
  });

  return record;
}

export async function submitIdentityVerification(params: {
  partyId: string;
  displayName: string;
  method: string;
  nin: string;
  fullName: string;
}) {
  return recordIdentityCheck({
    partyId: params.partyId,
    displayName: params.displayName,
    method: params.method,
    nin: params.nin,
    fullName: params.fullName,
    actorPartyId: params.partyId,
    actorRole: null,
  });
}

export class IdentityCheckNotApplicableError extends Error {
  constructor(role: string) {
    super(`identity verification applies to tenant and lister accounts — this is a ${role} account`);
    this.name = 'IdentityCheckNotApplicableError';
  }
}

/**
 * POST /v1/admin/users/:partyId/identity-check — operations runs the
 * identity check for an account (Task 14).
 *
 * ── Why operations needs this at all ──
 * The V1 check is self-service, but the phone still happens: an account
 * holder whose check failed on a typo (or whose name on the account no
 * longer matches their ID) calls in, and the honest options are to talk
 * them through the same form or to run the same check for them with the
 * details they give over the phone. This is the second option — the SAME
 * mock outcome logic, never a manual "mark verified" shortcut, so the
 * record stays one vocabulary.
 *
 * The audit row says by=operations with the admin as the acting actor, so
 * "the account verified themselves" and "operations ran this check" stay
 * distinguishable forever — the same distinction viewing cancellations
 * already carry. A failed result is a true record, not an error: only an
 * inapplicable account (staff) or a missing one is refused.
 */
export async function runIdentityCheckForParty(params: {
  partyId: string;
  adminPartyId: string;
  method: string;
  nin: string;
  fullName: string;
}) {
  const party = await db.party.findUnique({
    where: { id: params.partyId },
    include: { account: true },
  });
  if (!party || !party.account) throw new PartyNotFoundError(params.partyId);
  if (party.account.role !== 'tenant' && party.account.role !== 'lister') {
    throw new IdentityCheckNotApplicableError(party.account.role);
  }

  return recordIdentityCheck({
    partyId: party.id,
    displayName: party.displayName,
    method: params.method,
    nin: params.nin,
    fullName: params.fullName,
    actorPartyId: params.adminPartyId,
    actorRole: 'admin',
    byOperations: true,
  });
}

// ── staff provisioning ───────────────────────────────────────────────────

export class StaffRoleError extends Error {
  constructor() {
    super('staff accounts can only be foo or admin — tenants and listers self-serve');
    this.name = 'StaffRoleError';
  }
}

/** POST /v1/auth/staff — an admin provisions field officers and admins. */
export async function provisionStaff(params: {
  actorPartyId: string;
  displayName: string;
  primaryPhone: string;
  password: string;
  role: AuthRole;
}) {
  if (params.role !== 'foo' && params.role !== 'admin') throw new StaffRoleError();
  const { hashPassword } = await import('./auth');

  return db.$transaction(async (tx) => {
    const party = await tx.party.create({
      data: { displayName: params.displayName, primaryPhone: params.primaryPhone, status: 'active' },
    });
    const account = await tx.userAccount.create({
      data: { partyId: party.id, role: params.role, status: 'active' },
    });
    await tx.userCredential.create({
      data: { userAccountId: account.id, passwordHash: await hashPassword(params.password) },
    });
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.actorPartyId,
        actorRole: 'admin',
        action: 'staff_provisioned',
        entityType: 'user_account',
        entityId: account.id,
        detail: JSON.stringify({ role: params.role }),
      },
    });
    return { party, account };
  });
}

// ── audit reads ──────────────────────────────────────────────────────────

export async function recentAuditEvents(limit = 100) {
  const rows = await db.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { actor: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    actorName: r.actor?.displayName ?? 'system',
    actorRole: r.actorRole,
    detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
    createdAt: r.createdAt,
  }));
}

// ── verification queues ──────────────────────────────────────────────────
// The admin verification queue now lives in listings.ts as
// `adminVerificationQueue()` — one implementation of the publish gate's
// blocker list, shared with evaluatePublish and findForLister. The previous
// duplicate here is gone.

export async function markListingAwaitingVerification(listingId: string) {
  return db.listing.update({
    where: { id: listingId },
    data: { publicationState: 'awaiting_verification' },
  });
}

// ── reconciliation ───────────────────────────────────────────────────────

/**
 * The ops reconciliation view. Two assertions, honestly reported:
 *  1. every ledger posting balances (a false here means corruption bypassing post());
 *  2. PSP-recorded inflow equals ledger-recorded inflow (the mock always
 *     matches because it is the same process — a REAL provider is the point
 *     where this check earns its keep).
 */
export async function runReconciliation() {
  const postingsBalance = await everyPostingBalances();

  const pspTotal = await db.pspInstruction.aggregate({ where: { kind: 'collect', state: 'succeeded' }, _sum: { amount: true } });
  const ledgerInflow = await db.ledgerEntry.aggregate({
    where: { reference: 'fund_escrow', direction: 'credit' },
    _sum: { amount: true },
  });

  const ledgerBalance = ledgerInflow._sum.amount ?? 0n;
  const pspBalance = pspTotal._sum.amount ?? 0n;
  const isReconciled = postingsBalance && ledgerBalance === pspBalance;

  const check = await db.reconciliationCheck.create({
    data: {
      runAt: new Date(),
      ledgerBalance,
      pspBalance,
      isReconciled,
      discrepancyNote: isReconciled ? null : 'ledger postings unbalanced or PSP/ledger inflow mismatch',
    },
  });
  return check;
}

export async function recentReconciliationChecks(limit = 20) {
  return db.reconciliationCheck.findMany({ orderBy: { runAt: 'desc' }, take: limit });
}

// ── config reads for ops ─────────────────────────────────────────────────

export async function listConfigParameters() {
  return db.configParameter.findMany({ orderBy: { key: 'asc' } });
}

export async function listCommissionRateVersions() {
  return db.commissionRateVersion.findMany({ orderBy: { effectiveFrom: 'desc' } });
}

export async function listStaff() {
  const accounts = await db.userAccount.findMany({
    where: { role: { in: ['foo', 'admin'] } },
    include: { party: { select: { displayName: true, primaryPhone: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return accounts.map((a) => ({
    id: a.id,
    role: a.role,
    displayName: a.party.displayName,
    primaryPhone: a.party.primaryPhone,
    createdAt: a.createdAt,
  }));
}

export async function listOfficers() {
  const accounts = await db.userAccount.findMany({
    where: { role: 'foo', status: 'active' },
    include: { party: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return accounts.map((a) => ({ partyId: a.partyId, displayName: a.party.displayName }));
}

// ── user directory (admin) ───────────────────────────────────────────────

export interface DirectoryRow {
  partyId: string;
  displayName: string;
  primaryPhone: string;
  role: string;
  accountStatus: string;
  identityVerified: boolean;
  /** Landlord accounts only: the relationship they list under. */
  listerTier: string | null;
  listingCount: number;
  dealCount: number;
  createdAt: Date;
}

/**
 * The admin's account directory.
 *
 * ── Scope discipline ──
 * This answers "who has an account, is it in good standing, and how are
 * they using the platform" — the questions dispatch and dispute-handling
 * actually ask. It deliberately does NOT join identity documents, ledger
 * balances or free-text history: those are subject-scoped reads (the audit
 * trail), not a browsable directory. A searchable table here is account
 * administration; an unfiltered firehose of everything would be
 * surveillance, and the audit page already draws that line.
 *
 * Search is a phone/name substring from a GET form — shareable and
 * bookmarkable like every other filter in the product.
 */
export async function adminUserDirectory(query?: string, role?: string): Promise<DirectoryRow[]> {
  const q = query?.trim();
  // Server-authoritative enum check (same 422 VALIDATION contract as the
  // tier endpoint): an unknown role value is refused, never silently
  // ignored — a filter that pretends to work is worse than one that fails.
  const r = role?.trim();
  if (r && !(AUTH_ROLES as readonly string[]).includes(r)) {
    throw new ApiError(422, 'VALIDATION', `role must be one of: ${AUTH_ROLES.join(', ')}`);
  }
  const accounts = await db.userAccount.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { party: { displayName: { contains: q } } },
                { party: { primaryPhone: { contains: q } } },
              ],
            }
          : {},
        r ? { role: r as AuthRole } : {},
      ],
    },
    include: {
      party: {
        include: {
          identityVerifications: { orderBy: { createdAt: 'desc' }, take: 1 },
          listerProfile: true,
          _count: { select: { properties: true, dealsAsTenant: true, dealsAsLandlord: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return accounts.map((a) => ({
    partyId: a.partyId,
    displayName: a.party.displayName,
    primaryPhone: a.party.primaryPhone,
    role: a.role,
    accountStatus: a.status,
    identityVerified: a.party.identityVerifications[0]?.state === 'verified',
    listerTier: a.party.listerProfile?.tier ?? null,
    listingCount: a.party._count.properties,
    dealCount: a.party._count.dealsAsTenant + a.party._count.dealsAsLandlord,
    createdAt: a.createdAt,
  }));
}

export { AUTH_ROLES };

// ── account detail (admin) ───────────────────────────────────────────────

/** No account (or no party) answers to this id. */
export class PartyNotFoundError extends Error {
  constructor(partyId: string) {
    super(`no account found for party ${partyId}`);
    this.name = 'PartyNotFoundError';
  }
}

export interface AdminPartyDetail {
  party: {
    id: string;
    displayName: string;
    primaryPhone: string;
    status: string;
    createdAt: Date;
  };
  role: string;
  accountStatus: string;
  listerTier: string | null;
  identity: {
    state: string | null;
    method: string | null;
    checkedAt: Date | null;
    attempts: number;
    /** The provider is the sandbox mock; every surface must say so. */
    provider: 'sandbox-mock' | null;
  };
  /** Properties this party owns, newest first, with listing counts. */
  properties: Array<{
    id: string;
    label: string;
    neighbourhood: string;
    district: string;
    listingCount: number;
    liveListings: number;
    createdAt: Date;
  }>;
  /** Deals where this party is the tenant or the landlord. */
  deals: Array<{
    id: string;
    side: 'tenant' | 'landlord';
    status: string;
    neighbourhood: string;
    monthlyRent: string;
    createdAt: Date;
  }>;
  viewings: { requested: number; scheduled: number; conducted: number; cancelled: number };
  /**
   * This party's own trail, both directions: events they acted in, and
   * events carried out ON this account (tier changes, provisioning). A
   * subject-scoped read — exactly what the audit page's scope discipline
   * says an account page may do. No free-text, no other parties' rows.
   */
  audit: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    actorName: string;
    actorRole: string | null;
    detail: Record<string, unknown> | null;
    createdAt: Date;
  }>;
}

/**
 * One account, as operations may see it.
 *
 * ── Why this page exists and where its line is ──
 * The directory answers "who and how many"; resolving a dispute or a
 * landlord's phone call needs the one account in front of you: are they
 * verified, what do they hold, what has happened on their account. It
 * stays subject-scoped BY CONSTRUCTION — every query is filtered by this
 * partyId — and it shows deal states, not ledger balances (money detail
 * lives on the deal page where its audit trail lives too).
 */
export async function adminPartyDetail(partyId: string): Promise<AdminPartyDetail> {
  const party = await db.party.findUnique({
    where: { id: partyId },
    include: {
      account: true,
      identityVerifications: { orderBy: { createdAt: 'desc' } },
      listerProfile: true,
    },
  });
  if (!party || !party.account) throw new PartyNotFoundError(partyId);
  const account = party.account;

  const [properties, dealsAsTenant, dealsAsLandlord] = await Promise.all([
    db.property.findMany({
      where: { ownerPartyId: partyId },
      include: {
        neighbourhood: true,
        _count: { select: { listings: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    db.deal.findMany({
      where: { tenantPartyId: partyId },
      include: { listing: { include: { property: { include: { neighbourhood: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    db.deal.findMany({
      where: { landlordPartyId: partyId },
      include: { listing: { include: { property: { include: { neighbourhood: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);

  // Live listings per owned property — one grouped query, mapped per row.
  const liveByProperty = await db.listing.groupBy({
    by: ['propertyId'],
    where: { publicationState: 'live', property: { ownerPartyId: partyId } },
    _count: { propertyId: true },
  });
  const liveCountFor = (propertyId: string) =>
    liveByProperty.find((g) => g.propertyId === propertyId)?._count.propertyId ?? 0;

  // The tenant-side viewing record, counted by state (bounded read: an
  // account's own viewings, newest 200).
  const viewingRows = await db.viewing.findMany({
    where: { tenantPartyId: partyId },
    select: { id: true, status: true, scheduledFor: true, updatedAt: true, listingId: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  });
  const viewingsByState = { requested: 0, scheduled: 0, conducted: 0, cancelled: 0 };
  for (const v of viewingRows) {
    if (v.status in viewingsByState) viewingsByState[v.status as keyof typeof viewingsByState] += 1;
  }

  const ownDealIds = [...new Set([...dealsAsTenant, ...dealsAsLandlord].map((d) => d.id))];

  // Identity checks run BY OPERATIONS have the admin as their audit actor,
  // so they would not match `actorPartyId: partyId` — but they are exactly
  // what this trail exists to show. Their ids are already in hand from the
  // include above, so the subject-scoping stays by construction.
  const identityRecordIds = party.identityVerifications.map((i) => i.id);

  const auditRows = await db.auditEvent.findMany({
    where: {
      OR: [
        { actorPartyId: partyId },
        { entityType: 'party', entityId: partyId },
        // Money/consent events carried on this party's OWN deals still
        // belong on this account's trail — they are what a landlord calling
        // about "my money" needs to see, and they stay subject-scoped by
        // construction (only ids from the queries above enter this list).
        ...(ownDealIds.length ? [{ entityType: 'deal', entityId: { in: ownDealIds } }] : []),
        ...(identityRecordIds.length
          ? [{ entityType: 'identity_verification', entityId: { in: identityRecordIds } }]
          : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { actor: { select: { displayName: true } } },
  });

  const identity = party.identityVerifications;
  const latestVerified = identity.find((i) => i.state === 'verified');

  return {
    party: {
      id: party.id,
      displayName: party.displayName,
      primaryPhone: party.primaryPhone,
      status: party.status,
      createdAt: party.createdAt,
    },
    role: account.role,
    accountStatus: account.status,
    listerTier: party.listerProfile?.tier ?? null,
    identity: {
      state: latestVerified?.state ?? identity[0]?.state ?? null,
      method: (latestVerified ?? identity[0])?.method ?? null,
      checkedAt: (latestVerified ?? identity[0])?.verifiedAt ?? identity[0]?.createdAt ?? null,
      attempts: identity.length,
      provider: identity.length ? 'sandbox-mock' : null,
    },
    properties: properties.map((p) => ({
      id: p.id,
      label: `${p.bedrooms}-bed ${p.propertyType}`,
      neighbourhood: p.neighbourhood.name,
      district: p.neighbourhood.district,
      listingCount: p._count.listings,
      liveListings: liveCountFor(p.id),
      createdAt: p.createdAt,
    })),
    deals: [
      ...dealsAsTenant.map((d) => ({
        id: d.id,
        side: 'tenant' as const,
        status: d.status,
        neighbourhood: d.listing.property.neighbourhood.name,
        monthlyRent: (d.monthlyRentSnapshot ?? 0n).toString(),
        createdAt: d.createdAt,
      })),
      ...dealsAsLandlord.map((d) => ({
        id: d.id,
        side: 'landlord' as const,
        status: d.status,
        neighbourhood: d.listing.property.neighbourhood.name,
        monthlyRent: (d.monthlyRentSnapshot ?? 0n).toString(),
        createdAt: d.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    viewings: viewingsByState,
    audit: auditRows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actorName: r.actor?.displayName ?? 'system',
      actorRole: r.actorRole,
      detail: r.detail ? (JSON.parse(r.detail) as Record<string, unknown>) : null,
      createdAt: r.createdAt,
    })),
  };
}

// ── service-area administration (neighbourhoods) ─────────────────────────

/**
 * Why a neighbourhood toggle is an operations decision with an audit row:
 * `inServiceArea` is read LIVE by the public search filter, the publish
 * gates (a listing outside the area cannot go live) and the deal service
 * (an introduction outside it is refused). Turning it off silently would
 * strand live listings in a corridor we no longer serve; turning it on
 * widens what the platform will verify. Both directions deserve a record
 * of who moved the boundary and when.
 */
export async function adminNeighbourhoodDirectory() {
  const rows = await db.neighbourhood.findMany({
    orderBy: [{ district: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { properties: true } } },
  });
  return Promise.all(
    rows.map(async (n) => ({
      id: n.id,
      name: n.name,
      district: n.district,
      inServiceArea: n.inServiceArea,
      propertyCount: n._count.properties,
      liveListingCount: await db.listing.count({
        where: { publicationState: 'live', property: { neighbourhoodId: n.id } },
      }),
      hasCoordinates: n.latitude !== null && n.longitude !== null,
    })),
  );
}

export class DuplicateNeighbourhoodError extends Error {
  constructor(name: string, district: string) {
    super(`a neighbourhood called "${name}" already exists in ${district}`);
    this.name = 'DuplicateNeighbourhoodError';
  }
}

/**
 * F-015's create path, hardened for its first real UI: names are required,
 * a duplicate name+district is a 409 rather than a silent second row, and
 * the creation is audited like every other boundary move.
 */
export async function createServiceAreaNeighbourhood(params: {
  adminPartyId: string;
  name: string;
  district: string;
  inServiceArea: boolean;
}) {
  const name = params.name.trim();
  const district = params.district.trim();
  if (!name || !district) {
    throw new ApiError(400, 'VALIDATION', 'neighbourhood name and district are required');
  }
  const existing = await db.neighbourhood.findFirst({ where: { name, district } });
  if (existing) throw new DuplicateNeighbourhoodError(name, district);

  // Interactive transaction: the audit row needs the created row's id, so
  // both writes happen inside one callback (all-or-nothing).
  return db.$transaction(async (tx) => {
    const row = await tx.neighbourhood.create({
      data: { name, district, inServiceArea: params.inServiceArea },
    });
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        actorRole: 'admin',
        action: 'neighbourhood_created',
        entityType: 'neighbourhood',
        entityId: row.id,
        detail: JSON.stringify({ name, district, inServiceArea: params.inServiceArea }),
      },
    });
    return row;
  });
}

export async function setNeighbourhoodServiceArea(params: {
  adminPartyId: string;
  neighbourhoodId: string;
  inServiceArea: boolean;
}) {
  const row = await db.neighbourhood.findUnique({ where: { id: params.neighbourhoodId } });
  if (!row) throw new NeighbourhoodNotFoundError(params.neighbourhoodId);

  if (row.inServiceArea === params.inServiceArea) {
    // Idempotent by intent: a double-click re-records nothing — but the
    // caller still gets the current truth so the UI can confirm it.
    return { ...row, changed: false };
  }

  const liveListings = await db.listing.count({
    where: { publicationState: 'live', property: { neighbourhoodId: params.neighbourhoodId } },
  });

  const [updated] = await db.$transaction([
    db.neighbourhood.update({
      where: { id: params.neighbourhoodId },
      data: { inServiceArea: params.inServiceArea },
    }),
    db.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        actorRole: 'admin',
        action: 'service_area_changed',
        entityType: 'neighbourhood',
        entityId: params.neighbourhoodId,
        detail: JSON.stringify({
          neighbourhood: row.name,
          district: row.district,
          from: row.inServiceArea,
          to: params.inServiceArea,
          liveListingsAffected: params.inServiceArea ? 0 : liveListings,
        }),
      },
    }),
  ]);
  return { ...updated, changed: true };
}

// ── listing tier administration ─────────────────────────────────────────

/** A tier was asked for an account it cannot apply to. */
export class ListerTierNotApplicableError extends Error {
  constructor(partyId: string, role: string) {
    super(
      `account ${partyId} is a ${role}, not a landlord. A listing tier ` +
        'belongs to landlord accounts only — it states the relationship ' +
        'they have to the property they list.',
    );
    this.name = 'ListerTierNotApplicableError';
  }
}

/**
 * Operations sets one landlord account's listing tier.
 *
 * ── Why this is an operations decision, not a signup question ──
 * Registration cannot be allowed to self-declare "I am a broker": the
 * tier is exactly what gates the mandate requirement (SSOT Decision 8 —
 * a non-owner may not publish without the owner's written authority),
 * so letting a caller choose their own tier would let a middleman skip
 * the one control that restrains them. Operations sets it, the audit
 * trail carries who set it and what it was, and the publish gates read
 * the value live — the effect is immediate and traceable.
 */
export async function setListerTier(params: {
  adminPartyId: string;
  partyId: string;
  tier: string;
}) {
  if (!(LISTER_TIERS as readonly string[]).includes(params.tier)) {
    throw new Error(`"${params.tier}" is not a listing tier`);
  }

  const account = await db.userAccount.findUnique({
    where: { partyId: params.partyId },
    include: { party: { include: { listerProfile: true } } },
  });
  if (!account) throw new Error(`account ${params.partyId} not found`);
  if (account.role !== 'lister') {
    throw new ListerTierNotApplicableError(params.partyId, account.role);
  }

  const from = account.party.listerProfile?.tier ?? null;
  if (from === params.tier) {
    // Idempotent by intent: a double-click re-records nothing.
    return { partyId: params.partyId, tier: params.tier, previous: from, changed: false };
  }

  const [, profile] = await db.$transaction([
    db.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        actorRole: 'admin',
        action: 'lister_tier_changed',
        entityType: 'party',
        entityId: params.partyId,
        detail: JSON.stringify({ from: from ?? null, to: params.tier }),
      },
    }),
    db.listerProfile.upsert({
      where: { partyId: params.partyId },
      update: { tier: params.tier },
      create: { partyId: params.partyId, tier: params.tier as ListerTier },
    }),
  ]);

  return { partyId: params.partyId, tier: profile.tier, previous: from, changed: true };
}
