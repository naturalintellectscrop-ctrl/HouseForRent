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
import { AUTH_ROLES, type AuthRole } from './domain';

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
 */
export async function submitIdentityVerification(params: {
  partyId: string;
  displayName: string;
  method: string;
  nin: string;
  fullName: string;
}) {
  const nin = params.nin.trim().toUpperCase();
  const ninPattern = /^(CM|CF)[0-9A-Z]{12}$/;

  const state =
    ninPattern.test(nin) &&
    params.fullName.trim().toLowerCase() === params.displayName.trim().toLowerCase()
      ? 'verified'
      : 'failed';

  const record = await db.identityVerification.create({
    data: {
      partyId: params.partyId,
      method: params.method,
      state,
      reference: createHash('sha256').update(nin).digest('hex').slice(0, 16),
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
      actorPartyId: params.partyId,
      action: 'identity_verification',
      entityType: 'identity_verification',
      entityId: record.id,
      detail: JSON.stringify({ state, method: params.method, provider: 'sandbox-mock' }),
    },
  });

  return record;
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

/** Listings awaiting field verification (the FOO/ops verification queue). */
export async function verificationQueue() {
  const rows = await db.listing.findMany({
    where: { publicationState: { in: ['draft', 'awaiting_verification'] }, verificationState: 'unverified' },
    include: {
      property: { include: { neighbourhood: true, owner: { select: { displayName: true } } } },
      photos: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((l) => ({
    id: l.id,
    propertyId: l.propertyId,
    bedrooms: l.property.bedrooms,
    bathrooms: l.property.bathrooms,
    neighbourhood: l.property.neighbourhood.name,
    landmarkText: l.property.landmarkText,
    ownerName: l.property.owner.displayName,
    monthlyRent: l.monthlyRent.toString(),
    createdAt: l.createdAt,
    photoCount: l.photos.length,
  }));
}

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

export { AUTH_ROLES };
