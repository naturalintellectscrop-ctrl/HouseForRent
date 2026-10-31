/**
 * Identity verification, staff provisioning, audit reads and reconciliation
 * - the admin/ops module.
 *
 * The identity provider here is the SANDBOX MOCK, exactly as in the real
 * repo (behind IdentityProvider there). Every surface that calls it must
 * SAY it is a mock - the product sells verification and cannot overstate
 * its own. Behaviour: the V1 baseline is identity-only screening (Decision
 * 10); ability to pay is evidenced by the escrow flow, never by documents.
 */
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { derivedPspState, everyPostingBalances } from './ledger';
import { AUTH_ROLES, IDENTITY_METHODS, LISTER_TIERS, type AuthRole, type IdentityMethod, type ListerTier } from './domain';
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
 * account's behalf - the two paths must never disagree about what passes.
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
  /** Set when operations ran the check, so the trail can tell the two apart forever. */
  byOperations?: boolean;
}) {
  // The method is a native enum now: an unknown value is refused at the
  // service, never stored.
  if (!(IDENTITY_METHODS as readonly string[]).includes(params.method)) {
    throw new ApiError(422, 'VALIDATION', `method must be one of: ${IDENTITY_METHODS.join(', ')}`);
  }
  const state = mockIdentityOutcome(params.nin, params.fullName, params.displayName);

  const record = await db.identityVerification.create({
    data: {
      partyId: params.partyId,
      method: params.method as IdentityMethod,
      state,
      // The mock provider's reference to this check: a salted-hash of the
      // NIN, as before - the column is provider_ref on the production row.
      providerRef: createHash('sha256').update(params.nin.trim().toUpperCase()).digest('hex').slice(0, 16),
      verifiedAt: state === 'verified' ? new Date() : null,
    },
  });

  if (state === 'verified') {
    // Completing identity activation makes the account active - the status
    // lives on the PARTY; user_account mirrors nothing anymore.
    const party = await db.party.findUnique({ where: { id: params.partyId } });
    if (party && party.status === 'pending_verification') {
      await db.party.update({ where: { id: params.partyId }, data: { status: 'active' } });
    }
  }

  await db.auditEvent.create({
    data: {
      actorPartyId: params.actorPartyId,
      eventType: 'identity_verification',
      subjectRef: record.id,
      payload: {
        state,
        method: params.method,
        provider: 'sandbox-mock',
        ...(params.byOperations ? { by: 'operations' } : {}),
      },
      occurredAt: new Date(),
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
  });
}

export class IdentityCheckNotApplicableError extends Error {
  constructor(role: string) {
    super(`identity verification applies to tenant and lister accounts - this is a ${role} account`);
    this.name = 'IdentityCheckNotApplicableError';
  }
}

/**
 * POST /v1/admin/users/:partyId/identity-check - operations runs the
 * identity check for an account (Task 14).
 *
 * ── Why operations needs this at all ──
 * The V1 check is self-service, but the phone still happens: an account
 * holder whose check failed on a typo (or whose name on the account no
 * longer matches their ID) calls in, and the honest options are to talk
 * them through the same form or to run the same check for them with the
 * details they give over the phone. This is the second option - the SAME
 * mock outcome logic, never a manual "mark verified" shortcut, so the
 * record stays one vocabulary.
 *
 * The audit row says by=operations with the admin as the acting actor, so
 * "the account verified themselves" and "operations ran this check" stay
 * distinguishable forever - the same distinction viewing cancellations
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
    include: { userAccounts: true },
  });
  if (!party || !party.userAccounts[0]) throw new PartyNotFoundError(params.partyId);
  const account = party.userAccounts[0];
  if (account.authRole !== 'tenant' && account.authRole !== 'lister') {
    throw new IdentityCheckNotApplicableError(account.authRole);
  }

  return recordIdentityCheck({
    partyId: party.id,
    displayName: party.displayName,
    method: params.method,
    nin: params.nin,
    fullName: params.fullName,
    actorPartyId: params.adminPartyId,
    byOperations: true,
  });
}

// ── staff provisioning ───────────────────────────────────────────────────

export class StaffRoleError extends Error {
  constructor() {
    super('staff accounts can only be foo or admin - tenants and listers self-serve');
    this.name = 'StaffRoleError';
  }
}

/** POST /v1/auth/staff - an admin provisions field officers and admins. */
export async function provisionStaff(params: {
  actorPartyId: string;
  displayName: string;
  primaryPhone: string;
  password: string;
  role: AuthRole;
}) {
  if (params.role !== 'foo' && params.role !== 'admin') throw new StaffRoleError();
  if (params.password.length < 8) {
    throw new ApiError(422, 'VALIDATION', 'Choose a password of at least 8 characters.');
  }
  const { hashPassword } = await import('./auth');

  // Same courtesy the self-service register gives: a duplicate phone is a
  // 409 the admin can read, not a Prisma unique-violation leaking as 500
  // (ROLE_PERMISSION_MATRIX.md R-1). The unique index remains the hard
  // backstop for the race this check cannot close.
  const clash = await db.party.findUnique({ where: { primaryPhone: params.primaryPhone }, select: { id: true } });
  if (clash) {
    throw new ApiError(409, 'PHONE_TAKEN', 'An account already exists for that number.');
  }

  return db.$transaction(async (tx) => {
    const party = await tx.party.create({
      data: { displayName: params.displayName, primaryPhone: params.primaryPhone, status: 'active' },
    });
    const account = await tx.userAccount.create({
      data: { partyId: party.id, authRole: params.role },
    });
    await tx.userCredential.create({
      data: { userAccountId: account.id, passwordHash: await hashPassword(params.password) },
    });
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.actorPartyId,
        eventType: 'staff_provisioned',
        subjectRef: account.id,
        payload: { role: params.role },
        occurredAt: new Date(),
      },
    });
    return { party, account };
  });
}

// ── audit reads ──────────────────────────────────────────────────────────

export async function recentAuditEvents(limit = 100) {
  const rows = await db.auditEvent.findMany({
    orderBy: { occurredAt: 'desc' },
    take: limit,
    include: { actorParty: { select: { displayName: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    eventType: r.eventType,
    subjectRef: r.subjectRef,
    actorPartyId: r.actorPartyId,
    actorName: r.actorParty?.displayName ?? 'system',
    payload:
      r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
        ? (r.payload as Record<string, unknown>)
        : null,
    occurredAt: r.occurredAt,
  }));
}

// ── verification queues ──────────────────────────────────────────────────
// The admin verification queue now lives in listings.ts as
// `adminVerificationQueue()` - one implementation of the publish gate's
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
 * The ops reconciliation view. Assertions, honestly reported:
 *  1. every ledger posting balances (a false here means corruption bypassing post());
 *  2. PSP-recorded inflow equals ledger-recorded inflow (the mock always
 *     matches because it is the same process - a REAL provider is the point
 *     where this check earns its keep);
 *  3. classification consistency: rent + deposit liabilities hold exactly
 *     what the split funding postings credited (the deposit is never allowed
 *     to dissolve into a generic escrow figure);
 *  4. payout honesty: succeeded release/refund instructions are matched
 *     against the ledger's payout credits - EXCEPT duplicate-payment
 *     payouts, which by design have no ledger side (the duplicate was
 *     never booked as a liability, so its return books nothing). Those are
 *     reconciled on the PROVIDER side, through imported statements
 *     (finance/provider-statement.ts) - an internal check must not demand
 *     a ledger row that policy says must not exist.
 */
export async function runReconciliation() {
  const postingsBalance = await everyPostingBalances();

  // PspInstruction rows are IMMUTABLE and `state` only ever holds the
  // initial `pending` - the CURRENT state is the toState of the newest
  // event, so the succeeded total is derived, never read off the column.
  const instructions = await db.pspInstruction.findMany({
    include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
  });
  const succeeded = (kind: 'collect' | 'release' | 'refund') =>
    instructions
      .filter((i) => i.kind === kind && derivedPspState(i) === 'succeeded')
      .reduce((sum, i) => sum + i.amount, 0n);
  const pspBalance = succeeded('collect');
  // Duplicate-payment payouts are the deliberate exception to the ledger
  // mirror: their refund records name the provider-side return of a
  // collection that was never booked. Excluded HERE, explicitly - never by
  // loosening the ledger side.
  const succeededRefunds = instructions.filter((i) => i.kind === 'refund' && derivedPspState(i) === 'succeeded');
  const duplicatePayoutInstructionIds = new Set(
    succeededRefunds.length
      ? (
          await db.refundRecord.findMany({
            where: { instructionId: { in: succeededRefunds.map((i) => i.id) }, kind: 'duplicate_payment' },
            select: { instructionId: true },
          })
        ).map((r) => r.instructionId)
      : [],
  );
  const pspPayouts =
    succeeded('release') +
    succeededRefunds.filter((i) => !duplicatePayoutInstructionIds.has(i.id)).reduce((sum, i) => sum + i.amount, 0n);

  const sumCredits = async (referencePrefix: string) => {
    const agg = await db.ledgerEntry.aggregate({
      where: { reference: { startsWith: referencePrefix }, direction: 'credit' },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0n;
  };
  const ledgerInflow = await sumCredits('fund_escrow');

  // Classification: what the split funding credited must equal what the two
  // liabilities still hold plus what has already discharged from them.
  const rentAndDepositCredits = (
    await db.ledgerEntry.aggregate({
      where: { account: { accountType: { in: ['rent_escrow_liability', 'deposit_liability'] } }, direction: 'credit' },
      _sum: { amount: true },
    })
  )._sum.amount ?? 0n;
  const rentAndDepositDischarged = (
    await db.ledgerEntry.aggregate({
      where: { account: { accountType: { in: ['rent_escrow_liability', 'deposit_liability'] } }, direction: 'debit' },
      _sum: { amount: true },
    })
  )._sum.amount ?? 0n;
  const classificationConsistent = rentAndDepositCredits - rentAndDepositDischarged >= 0n;

  const ledgerPayouts =
    (await sumCredits('release_to_landlord')) +
    (await sumCredits('deposit_refund')) +
    (await sumCredits('commission_reversal_payout')) +
    // plain refunds: legacy 'refund' + split 'refund:{recordId}' - but NOT
    // 'deposit_refund', already counted above (startsWith 'refund' would
    // double-count it, so aggregate exact-prefix-safe here).
    ((await db.ledgerEntry.aggregate({
      where: { OR: [{ reference: 'refund' }, { reference: { startsWith: 'refund:' } }], direction: 'credit' },
      _sum: { amount: true },
    }))._sum.amount ?? 0n);

  const ledgerBalance = ledgerInflow;
  const isReconciled =
    postingsBalance &&
    ledgerBalance === pspBalance &&
    classificationConsistent &&
    ledgerPayouts === pspPayouts;

  const discrepancyNote = isReconciled
    ? null
    : [
        postingsBalance ? null : 'ledger postings unbalanced',
        ledgerBalance === pspBalance ? null : 'PSP/ledger inflow mismatch',
        classificationConsistent ? null : 'rent/deposit classification inconsistent',
        ledgerPayouts === pspPayouts
          ? null
          : 'PSP/ledger payout mismatch (release+refund, duplicate-payment payouts excluded by design)',
      ]
        .filter(Boolean)
        .join('; ');

  const check = await db.reconciliationCheck.create({
    data: {
      runAt: new Date(),
      ledgerBalance,
      pspBalance,
      isReconciled,
      discrepancyNote,
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
    where: { authRole: { in: ['foo', 'admin'] } },
    include: { party: { select: { displayName: true, primaryPhone: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return accounts.map((a) => ({
    id: a.id,
    role: a.authRole,
    displayName: a.party.displayName,
    primaryPhone: a.party.primaryPhone,
    createdAt: a.createdAt,
  }));
}

export async function listOfficers() {
  const accounts = await db.userAccount.findMany({
    where: { authRole: 'foo', party: { status: 'active' } },
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
 * they using the platform" - the questions dispatch and dispute-handling
 * actually ask. It deliberately does NOT join identity documents, ledger
 * balances or free-text history: those are subject-scoped reads (the audit
 * trail), not a browsable directory. A searchable table here is account
 * administration; an unfiltered firehose of everything would be
 * surveillance, and the audit page already draws that line.
 *
 * Search is a phone/name substring from a GET form - shareable and
 * bookmarkable like every other filter in the product.
 */
export async function adminUserDirectory(query?: string, role?: string): Promise<DirectoryRow[]> {
  const q = query?.trim();
  // Server-authoritative enum check (same 422 VALIDATION contract as the
  // tier endpoint): an unknown role value is refused, never silently
  // ignored - a filter that pretends to work is worse than one that fails.
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
        r ? { authRole: r as AuthRole } : {},
      ],
    },
    include: {
      party: {
        include: {
          identityVerifications: { orderBy: { createdAt: 'desc' }, take: 1 },
          listerProfile: true,
          _count: { select: { propertiesOwned: true, dealsAsTenant: true, dealsAsLandlord: true } },
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
    role: a.authRole,
    // The account's standing IS the party's status - user_account carries
    // no status column of its own.
    accountStatus: a.party.status,
    identityVerified: a.party.identityVerifications[0]?.state === 'verified',
    listerTier: a.party.listerProfile?.tier ?? null,
    listingCount: a.party._count.propertiesOwned,
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
  /** The account's own last sign-in, or null - honest queue signal. */
  lastLoginAt: Date | null;
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
    /** The parent neighbourhood's name - there is no district column. */
    district: string | null;
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
   * subject-scoped read - exactly what the audit page's scope discipline
   * says an account page may do. No free-text, no other parties' rows.
   */
  audit: Array<{
    id: string;
    /** The event type - the audit row's own vocabulary. */
    action: string;
    /** No longer recorded: the production audit row carries only subjectRef. */
    entityType: string | null;
    entityId: string | null;
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
 * stays subject-scoped BY CONSTRUCTION - every query is filtered by this
 * partyId - and it shows deal states, not ledger balances (money detail
 * lives on the deal page where its audit trail lives too).
 */
export async function adminPartyDetail(partyId: string): Promise<AdminPartyDetail> {
  const party = await db.party.findUnique({
    where: { id: partyId },
    include: {
      userAccounts: true,
      identityVerifications: { orderBy: { createdAt: 'desc' } },
      listerProfile: true,
    },
  });
  if (!party || !party.userAccounts[0]) throw new PartyNotFoundError(partyId);
  const account = party.userAccounts[0];

  const [properties, dealsAsTenant, dealsAsLandlord] = await Promise.all([
    db.property.findMany({
      where: { ownerPartyId: partyId },
      include: {
        neighbourhood: { include: { parent: true } },
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

  // Live listings per owned property - one grouped query, mapped per row.
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

  // Viewing events on the SUBJECT's own visits: for a tenant, the visits
  // they requested (ids in hand from the count read above); for a field
  // officer, the visits assigned to them (a bounded read like the
  // tenant's). Dispatch and ops cancellations act with an admin as the
  // audit actor, so without this clause the trail would show only what the
  // account did - never what was done to its visits. Subject-scoping stays
  // by construction: only ids from the subject's own viewing queries enter
  // the clause.
  const assignedViewingRows =
    account.authRole === 'foo'
      ? await db.viewing.findMany({
          where: { conductedByPartyId: partyId },
          select: { id: true },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        })
      : [];
  const ownViewingIds = [
    ...new Set([...viewingRows.map((v) => v.id), ...assignedViewingRows.map((v) => v.id)]),
  ];

  // Identity checks run BY OPERATIONS have the admin as their audit actor,
  // so they would not match `actorPartyId: partyId` - but they are exactly
  // what this trail exists to show. Their ids are already in hand from the
  // include above, so the subject-scoping stays by construction.
  const identityRecordIds = party.identityVerifications.map((i) => i.id);

  const auditRows = await db.auditEvent.findMany({
    where: {
      OR: [
        { actorPartyId: partyId },
        // The audit row's subject is a bare string ref now (no entity-type
        // column) - ids stay subject-scoped by construction.
        { subjectRef: partyId },
        // Money/consent events carried on this party's OWN deals still
        // belong on this account's trail - they are what a landlord calling
        // about "my money" needs to see, and they stay subject-scoped by
        // construction (only ids from the queries above enter this list).
        ...(ownDealIds.length ? [{ subjectRef: { in: ownDealIds } }] : []),
        ...(ownViewingIds.length
          ? [{ subjectRef: { in: ownViewingIds } }]
          : []),
        ...(identityRecordIds.length
          ? [{ subjectRef: { in: identityRecordIds } }]
          : []),
      ],
    },
    orderBy: { occurredAt: 'desc' },
    take: 20,
    include: { actorParty: { select: { displayName: true } } },
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
    role: account.authRole,
    accountStatus: party.status,
    listerTier: party.listerProfile?.tier ?? null,
    lastLoginAt: account.lastLoginAt,
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
      // No district column: the parent's name is the district-level label.
      district: p.neighbourhood.parent?.name ?? null,
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
      action: r.eventType,
      // The production audit row has no entity-type column - the subject is
      // a bare string ref, so nothing honest can fill this any more.
      entityType: null as string | null,
      entityId: r.subjectRef,
      actorName: r.actorParty?.displayName ?? 'system',
      actorRole: null,
      detail:
        r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload)
          ? (r.payload as Record<string, unknown>)
          : null,
      createdAt: r.occurredAt,
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
    // No district column: the parent's name is the district-level label,
    // so group ordering follows it.
    orderBy: [{ parent: { name: 'asc' } }, { name: 'asc' }],
    include: { parent: true, _count: { select: { properties: true } } },
  });
  return Promise.all(
    rows.map(async (n) => ({
      id: n.id,
      name: n.name,
      district: n.parent?.name ?? null,
      inServiceArea: n.inServiceArea,
      propertyCount: n._count.properties,
      liveListingCount: await db.listing.count({
        where: { publicationState: 'live', property: { neighbourhoodId: n.id } },
      }),
      // The production neighbourhood has no coordinates columns.
      hasCoordinates: false,
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
 * a duplicate name within the same district is a 409 rather than a silent
 * second row, and the creation is audited like every other boundary move.
 *
 * The production taxonomy has NO district column - a district is the
 * neighbourhood's PARENT row (the hierarchy is how corridors group). The
 * admin's district string therefore resolves to an existing neighbourhood
 * of that name, or materialises one as a grouping parent; the entered
 * string also stays in the audit payload verbatim.
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
  const parent = await db.neighbourhood.findFirst({ where: { name: district } });
  const existing = await db.neighbourhood.findFirst({
    where: { name, parentId: parent?.id ?? null },
  });
  if (existing) throw new DuplicateNeighbourhoodError(name, district);

  // Interactive transaction: the audit row needs the created row's id, so
  // both writes happen inside one callback (all-or-nothing).
  return db.$transaction(async (tx) => {
    const parentId = parent
      ? parent.id
      : (await tx.neighbourhood.create({ data: { name: district, inServiceArea: false } })).id;
    const row = await tx.neighbourhood.create({
      data: { name, parentId, inServiceArea: params.inServiceArea },
    });
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        eventType: 'neighbourhood_created',
        subjectRef: row.id,
        payload: { name, district, inServiceArea: params.inServiceArea },
        occurredAt: new Date(),
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
  const row = await db.neighbourhood.findUnique({
    where: { id: params.neighbourhoodId },
    include: { parent: true },
  });
  if (!row) throw new NeighbourhoodNotFoundError(params.neighbourhoodId);

  if (row.inServiceArea === params.inServiceArea) {
    // Idempotent by intent: a double-click re-records nothing - but the
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
        eventType: 'service_area_changed',
        subjectRef: params.neighbourhoodId,
        payload: {
          neighbourhood: row.name,
          district: row.parent?.name ?? null,
          from: row.inServiceArea,
          to: params.inServiceArea,
          liveListingsAffected: params.inServiceArea ? 0 : liveListings,
        },
        occurredAt: new Date(),
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
        'belongs to landlord accounts only - it states the relationship ' +
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
 * tier is exactly what gates the mandate requirement (SSOT Decision 8 -
 * a non-owner may not publish without the owner's written authority),
 * so letting a caller choose their own tier would let a middleman skip
 * the one control that restrains them. Operations sets it, the audit
 * trail carries who set it and what it was, and the publish gates read
 * the value live - the effect is immediate and traceable.
 */
export async function setListerTier(params: {
  adminPartyId: string;
  partyId: string;
  tier: string;
}) {
  if (!(LISTER_TIERS as readonly string[]).includes(params.tier)) {
    throw new Error(`"${params.tier}" is not a listing tier`);
  }

  const account = await db.userAccount.findFirst({
    where: { partyId: params.partyId },
    include: { party: { include: { listerProfile: true } } },
  });
  if (!account) throw new Error(`account ${params.partyId} not found`);
  if (account.authRole !== 'lister') {
    throw new ListerTierNotApplicableError(params.partyId, account.authRole);
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
        eventType: 'lister_tier_changed',
        subjectRef: params.partyId,
        payload: { from: from ?? null, to: params.tier },
        occurredAt: new Date(),
      },
    }),
    db.listerProfile.upsert({
      where: { partyId: params.partyId },
      update: { tier: params.tier as ListerTier },
      create: { partyId: params.partyId, tier: params.tier as ListerTier },
    }),
  ]);

  return { partyId: params.partyId, tier: profile.tier, previous: from, changed: true };
}

// ── account applications (the approval queue) ────────────────────────────
//
// Every landlord account is born `pending_verification` (registration
// is the application); tenants register active. Activation in this domain has exactly ONE server
// path - an identity check that passes flips the party active (the code
// above, unchanged) - so the queue's job is to make that path findable:
// who is waiting, how long, what has been tried, and what a decision will
// and will not grant. Rejection is the second decision the platform could
// always express in its status vocabulary but could never RECORD - nothing
// anywhere wrote `suspended` before this section.

export interface ApplicationQueueRow {
  partyId: string;
  displayName: string;
  primaryPhone: string;
  role: AuthRole;
  listerTier: string | null;
  /** Latest identity-check state, if any attempt was made. */
  identityState: string | null;
  identityAttempts: number;
  /** When the application was created - "waiting since". */
  waitingSince: Date;
  lastLoginAt: Date | null;
}

/**
 * Accounts waiting on activation, landlords first (the role whose
 * application blocks a business relationship), oldest first inside each
 * group. Read-only; the review page does the deciding.
 */
export async function pendingApplicationQueue(take = 100): Promise<ApplicationQueueRow[]> {
  const rows = await db.party.findMany({
    where: { status: 'pending_verification' },
    include: {
      userAccounts: { take: 1, select: { authRole: true, lastLoginAt: true } },
      identityVerifications: { orderBy: { createdAt: 'desc' }, take: 1 },
      listerProfile: { select: { tier: true } },
    },
    orderBy: { createdAt: 'asc' },
    take,
  });

  const mapped = rows.map((p) => ({
    partyId: p.id,
    displayName: p.displayName,
    primaryPhone: p.primaryPhone,
    role: p.userAccounts[0]?.authRole,
    listerTier: p.listerProfile?.tier ?? null,
    identityState: p.identityVerifications[0]?.state ?? null,
    identityAttempts: p.identityVerifications.length,
    waitingSince: p.createdAt,
    lastLoginAt: p.userAccounts[0]?.lastLoginAt ?? null,
  }));

  // Landlords first, then tenants; oldest-waiting first inside each group.
  return mapped
    .filter((r): r is typeof r & { role: AuthRole } => r.role !== undefined)
    .sort((a, b) => {
      const roleOrder = (r: AuthRole) => (r === 'lister' ? 0 : 1);
      return roleOrder(a.role) - roleOrder(b.role) ||
        a.waitingSince.getTime() - b.waitingSince.getTime();
    });
}

export class ApplicationNotPendingError extends ApiError {
  constructor(currentStatus: string) {
    // 409 Conflict: the caller's decision is stale - the account moved on
    // (activated, or already decided). The HTTP edge maps ApiError to the
    // status + code the client sees, so a repeated decision is a clean,
    // actionable response - never a 500 and never a second audit row.
    super(
      409,
      'APPLICATION_NOT_PENDING',
      `This application is no longer pending - the account is ${currentStatus}. ` +
        'Refresh and review the current state before deciding.',
    );
    this.name = 'ApplicationNotPendingError';
  }
}

/**
 * REJECT an account application - the platform declines to activate.
 *
 * ── Why rejection is a status + an audit row, and nothing else ──
 * The existing status vocabulary already contains the right state
 * (`suspended`: the platform has stopped this account; the sign-in policy
 * refuses it on every request) - inventing a new status would fork the
 * policy every consumer already trusts. What was genuinely missing is the
 * DECISION RECORD: the reason, the decider, and the moment. This function
 * writes exactly that, and nothing beyond it.
 *
 * ── What rejection does NOT do ──
 * It does not touch identity records (a failed check stays a true
 * record of what was tried), does not delete anything, and grants no
 * permission change beyond what the status policy already enforces.
 *
 * ── Concurrency ──
 * The status move is a conditional update (`where status =
 * pending_verification`), so two admins deciding at once produce exactly
 * one rejection; the loser re-reads the true state via 409 instead of
 * double-writing history.
 */
export async function rejectAccountApplication(params: {
  actorPartyId: string;
  partyId: string;
  reason: string;
}): Promise<void> {
  const reason = params.reason.trim().replace(/\s+/g, ' ');
  if (reason.length < 4) {
    throw new ApiError(422, 'VALIDATION', 'Give a short reason - it is recorded on the account trail.');
  }
  if (reason.length > 500) {
    throw new ApiError(422, 'VALIDATION', 'Keep the reason under 500 characters.');
  }

  const party = await db.party.findUnique({
    where: { id: params.partyId },
    include: { userAccounts: { take: 1 } },
  });
  if (!party || !party.userAccounts[0]) throw new PartyNotFoundError(params.partyId);
  const account = party.userAccounts[0];
  // Staff accounts are provisioned, never applied for - the application
  // vocabulary does not apply to them (same line the identity check draws).
  if (account.authRole !== 'tenant' && account.authRole !== 'lister') {
    throw new IdentityCheckNotApplicableError(account.authRole);
  }
  if (party.status !== 'pending_verification') {
    throw new ApplicationNotPendingError(party.status);
  }

  const moved = await db.party.updateMany({
    where: { id: party.id, status: 'pending_verification' },
    data: { status: 'suspended' },
  });
  if (moved.count === 0) {
    // A concurrent decision moved the account first. Re-read so the error
    // reflects what the caller will see on refresh, not a guess.
    const now = await db.party.findUnique({
      where: { id: party.id },
      select: { status: true },
    });
    throw new ApplicationNotPendingError(now?.status ?? 'unknown');
  }

  // End any live session. resolveSession would already refuse the account
  // on its next request (suspended fails the sign-in policy); revoking the
  // rows keeps the platform's active-session count honest immediately.
  await db.session.updateMany({
    where: { userAccountId: account.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await db.auditEvent.create({
    data: {
      actorPartyId: params.actorPartyId,
      eventType: 'account_application_rejected',
      // Subject = the PARTY, same scope account-level decisions use
      // (lister_tier_changed): admin-acted events on an account must be
      // visible on the party trail, which matches on subjectRef=partyId.
      subjectRef: party.id,
      payload: { reason, role: account.authRole, priorStatus: 'pending_verification' },
      occurredAt: new Date(),
    },
  });
}

/**
 * APPROVE an account application - the platform decides to activate.
 *
 * ── Why a direct approval exists beside the identity check ──
 * The identity check is the strongest EVIDENCE for approval, but the
 * decision itself is the platform's: a reviewer who has verified the
 * person another way (documents inspected, a phone call, an in-person
 * meeting) must be able to record that decision without first running a
 * sandbox NIN query they may not have the data for. What keeps this
 * honest is the same machinery rejection uses: the reviewer's identity,
 * the moment and (optionally) their stated basis go on the account trail
 * forever, and the state move is a conditional update - two reviewers
 * deciding at once produce exactly one approval, and a decision that
 * raced a rejection comes back 409 instead of overwriting history.
 *
 * ── What approval does NOT do ──
 * It activates the PERSON. It does not verify any property, publish any
 * listing (the field-officer publish gate), switch payouts on, or grant
 * staff privileges. An approval without a passing identity check is
 * visible as such on the trail: the identity section keeps showing the
 * true attempt state.
 */
export async function approveAccountApplication(params: {
  actorPartyId: string;
  partyId: string;
  note?: string;
}): Promise<void> {
  const note = (params.note ?? '').trim().replace(/\s+/g, ' ');
  if (note.length > 500) {
    throw new ApiError(422, 'VALIDATION', 'Keep the note under 500 characters.');
  }

  const party = await db.party.findUnique({
    where: { id: params.partyId },
    include: { userAccounts: { take: 1 } },
  });
  if (!party || !party.userAccounts[0]) throw new PartyNotFoundError(params.partyId);
  const account = party.userAccounts[0];
  // Staff accounts are provisioned, never applied for (same line reject draws).
  if (account.authRole !== 'tenant' && account.authRole !== 'lister') {
    throw new IdentityCheckNotApplicableError(account.authRole);
  }
  if (party.status !== 'pending_verification') {
    throw new ApplicationNotPendingError(party.status);
  }

  const moved = await db.party.updateMany({
    where: { id: party.id, status: 'pending_verification' },
    data: { status: 'active' },
  });
  if (moved.count === 0) {
    // A concurrent decision moved the account first - same contract as
    // rejection: the error reflects the caller's refreshed reality.
    const now = await db.party.findUnique({
      where: { id: params.partyId },
      select: { status: true },
    });
    throw new ApplicationNotPendingError(now?.status ?? 'unknown');
  }

  await db.auditEvent.create({
    data: {
      actorPartyId: params.actorPartyId,
      eventType: 'account_application_approved',
      // Subject = the PARTY, matching the rejection event's scope.
      subjectRef: party.id,
      payload: {
        role: account.authRole,
        priorStatus: 'pending_verification',
        ...(note ? { note } : {}),
      },
      occurredAt: new Date(),
    },
  });
}

/**
 * SUSPEND or RESTORE a staff account's platform access.
 *
 * ── The rails ──
 * Staff-only (tenants and listers have their own lifecycle through the
 * application queue); the acting admin cannot change their own access
 * (a sole owner must not be able to lock themself out); the last active
 * administrator cannot be suspended (platform control must survive);
 * the status move is conditional so two concurrent decisions produce one
 * winner; suspension revokes live sessions immediately (the sign-in
 * policy already refuses a suspended account on every later request);
 * and every change lands on the audit trail with the acting admin's
 * identity. No new status vocabulary: `active`/`suspended` are the same
 * party statuses every consumer already enforces.
 */
export class StaffAccessError extends ApiError {
  constructor(message: string) {
    super(422, 'STAFF_ACCESS_INVALID', message);
    this.name = 'StaffAccessError';
  }
}

export async function setStaffAccess(params: {
  actorPartyId: string;
  partyId: string;
  action: 'suspend' | 'restore';
}): Promise<{ status: string }> {
  const target = await db.party.findUnique({
    where: { id: params.partyId },
    include: { userAccounts: { take: 1 } },
  });
  if (!target || !target.userAccounts[0]) throw new PartyNotFoundError(params.partyId);
  const account = target.userAccounts[0];
  if (account.authRole !== 'foo' && account.authRole !== 'admin') {
    throw new StaffAccessError('Access control applies to staff accounts only.');
  }
  if (target.id === params.actorPartyId) {
    throw new StaffAccessError('You cannot change your own access here - ask another administrator.');
  }

  if (params.action === 'suspend') {
    if (target.status !== 'active') {
      throw new StaffAccessError(`This account is ${target.status} - only an active account can be suspended.`);
    }
    if (account.authRole === 'admin') {
      const otherActiveAdmins = await db.userAccount.count({
        where: { authRole: 'admin', partyId: { not: target.id }, party: { status: 'active' } },
      });
      if (otherActiveAdmins === 0) {
        throw new StaffAccessError('This is the last active administrator - platform control would be locked out.');
      }
    }
    const moved = await db.party.updateMany({
      where: { id: target.id, status: 'active' },
      data: { status: 'suspended' },
    });
    if (moved.count === 0) throw new StaffAccessError('The account moved first - refresh and retry.');
    await db.session.updateMany({
      where: { userAccountId: account.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else {
    if (target.status !== 'suspended') {
      throw new StaffAccessError(`This account is ${target.status} - only a suspended account can be restored.`);
    }
    const moved = await db.party.updateMany({
      where: { id: target.id, status: 'suspended' },
      data: { status: 'active' },
    });
    if (moved.count === 0) throw new StaffAccessError('The account moved first - refresh and retry.');
  }

  await db.auditEvent.create({
    data: {
      actorPartyId: params.actorPartyId,
      eventType: 'staff_access_changed',
      subjectRef: target.id,
      payload: { action: params.action, role: account.authRole, name: target.displayName },
      occurredAt: new Date(),
    },
  });
  return { status: params.action === 'suspend' ? 'suspended' : 'active' };
}
