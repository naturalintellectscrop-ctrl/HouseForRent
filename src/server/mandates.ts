/**
 * Property mandates (SSOT Decision 8 / FR-3.2).
 *
 * A lister whose tier is not `property_owner` - a broker agent or a
 * property management company - may register and market a home they do
 * not own. Before such a listing can publish, the platform must hold a
 * VERIFIED mandate for that specific property: the property owner's
 * written authority for us to market it. The publish gate in
 * `listings.ts` already refuses without one; this service is the open
 * half of F-003 - how a mandate gets submitted, and how operations
 * decides it.
 *
 * The load-bearing rules:
 *  - Only the party the property is registered under can submit its
 *    mandate, and only when their tier actually needs one. A property
 *    owner lists their own home; a "mandate on your own home" is not a
 *    thing the platform holds.
 *  - One mandate per (lister, property). An existing pending or verified
 *    mandate is returned unchanged - resubmission cannot spam rows or
 *    reset a decision. A REJECTED mandate is the legitimate resubmission
 *    path: that same row is reset to pending, so the history of a
 *    property's authority is one row per relationship, not a pile.
 *  - The decision reason lives in the AUDIT TRAIL, not on the mandate
 *    row. The production mandate row has no note column at all - the
 *    lister's submission note AND the ops decision note are both audit
 *    content (the row carries only the state); ops-facing reads
 *    deliberately do not re-serve the decision note.
 *  - Every state change writes an AuditEvent in the same transaction as
 *    the write it describes.
 */
import { db } from '@/lib/db';

// ── errors ───────────────────────────────────────────────────────────────

export class PropertyNotFoundError extends Error {
  constructor(propertyId: string) {
    super(`property ${propertyId} not found`);
    this.name = 'PropertyNotFoundError';
  }
}

export class NotYourPropertyError extends Error {
  constructor(propertyId: string) {
    super(
      `property ${propertyId} is registered under a different account. ` +
        'A mandate is submitted by the account the property is registered under.',
    );
    this.name = 'NotYourPropertyError';
  }
}

export class MandateNotNeededError extends Error {
  constructor(partyId: string) {
    super(
      `account ${partyId} lists as a property owner. Property owners list ` +
        'their own homes and never need a mandate - a mandate is the ' +
        "owner's written authority given to someone else, so the platform " +
        'does not hold one against the owner themselves.',
    );
    this.name = 'MandateNotNeededError';
  }
}

export class MandateNotFoundError extends Error {
  constructor(mandateId: string) {
    super(`mandate ${mandateId} not found`);
    this.name = 'MandateNotFoundError';
  }
}

export class MandateAlreadyDecidedError extends Error {
  constructor(mandateId: string, state: string) {
    super(
      `mandate ${mandateId} has already been decided (state: ${state}). ` +
        'A decision is only taken on a pending mandate; a rejected ' +
        'mandate returns to the queue when the lister submits it again.',
    );
    this.name = 'MandateAlreadyDecidedError';
  }
}

export class InvalidMandateDecisionError extends Error {
  constructor(decision: unknown) {
    super(`"${String(decision)}" is not a mandate decision. Use "verified" or "rejected".`);
    this.name = 'InvalidMandateDecisionError';
  }
}

// ── lister side ──────────────────────────────────────────────────────────

/**
 * A lister submits (or, after a rejection, resubmits) the mandate for one
 * specific property. Idempotent while pending or verified.
 */
export async function submitMandate(params: {
  propertyId: string;
  listerPartyId: string;
  note?: string;
}) {
  const property = await db.property.findUnique({ where: { id: params.propertyId } });
  if (!property) throw new PropertyNotFoundError(params.propertyId);

  if (property.ownerPartyId !== params.listerPartyId) {
    throw new NotYourPropertyError(params.propertyId);
  }

  const profile = await db.listerProfile.findUnique({ where: { partyId: params.listerPartyId } });
  if (!profile || profile.tier === 'property_owner') {
    throw new MandateNotNeededError(params.listerPartyId);
  }

  const note = params.note?.trim() ? params.note.trim() : null;

  const existing = await db.propertyMandate.findFirst({
    where: { propertyId: params.propertyId, listerPartyId: params.listerPartyId },
    orderBy: { createdAt: 'desc' },
  });

  // Verified: the authority is already on file - say so again, change nothing.
  if (existing?.state === 'verified') return existing;
  // Pending: an operations decision is already owed - no duplicate, and the
  // original submission stays immutable.
  if (existing?.state === 'pending') return existing;

  const resubmission = existing?.state === 'rejected';

  return db.$transaction(async (tx) => {
    // A rejected mandate returns to the queue on the SAME row: the reset
    // clears the previous decision (verifiedAt + verifiedByPartyId) so a
    // pending row never claims a verifier it no longer has.
    const mandate = resubmission
      ? await tx.propertyMandate.update({
          where: { id: existing.id },
          data: { state: 'pending', verifiedAt: null, verifiedByPartyId: null },
        })
      : await tx.propertyMandate.create({
          data: {
            propertyId: params.propertyId,
            listerPartyId: params.listerPartyId,
            state: 'pending',
          },
        });

    await tx.auditEvent.create({
      data: {
        actorPartyId: params.listerPartyId,
        eventType: 'mandate_submitted',
        subjectRef: mandate.id,
        payload: {
          propertyId: params.propertyId,
          note: note ?? null,
          resubmission,
        },
        occurredAt: new Date(),
      },
    });

    return mandate;
  });
}

/**
 * A lister's own mandates, newest first - the panel on the listing page
 * reads the row for its property from this.
 */
export async function findMandatesForLister(listerPartyId: string) {
  const rows = await db.propertyMandate.findMany({
    where: { listerPartyId },
    orderBy: { createdAt: 'desc' },
    include: { property: { include: { neighbourhood: true } } },
  });

  return rows.map((m) => ({
    id: m.id,
    state: m.state,
    // The production row has no note column; the submission note lives in
    // the audit trail (`mandate_submitted`).
    note: null as string | null,
    createdAt: m.createdAt.toISOString(),
    decidedAt: m.verifiedAt?.toISOString() ?? null,
    property: {
      id: m.property.id,
      landmarkText: m.property.landmarkText,
      neighbourhoodName: m.property.neighbourhood.name,
      ownerName: null,
    },
    listerPartyId,
    listerName: null,
    listerTier: null,
  }));
}

// ── ops side ─────────────────────────────────────────────────────────────

/**
 * Operations decides one pending mandate. The decision note is audit
 * content, not mandate content: the row keeps the lister's submission
 * note, the audit keeps why it was decided the way it was.
 */
export async function decideMandate(params: {
  mandateId: string;
  adminPartyId: string;
  decision: 'verified' | 'rejected';
  note?: string;
}) {
  if (params.decision !== 'verified' && params.decision !== 'rejected') {
    throw new InvalidMandateDecisionError(params.decision);
  }

  const mandate = await db.propertyMandate.findUnique({ where: { id: params.mandateId } });
  if (!mandate) throw new MandateNotFoundError(params.mandateId);
  if (mandate.state !== 'pending') {
    throw new MandateAlreadyDecidedError(mandate.id, mandate.state);
  }

  const note = params.note?.trim() ? params.note.trim() : null;

  return db.$transaction(async (tx) => {
    const updated = await tx.propertyMandate.update({
      where: { id: mandate.id },
      data: { state: params.decision, verifiedAt: new Date(), verifiedByPartyId: params.adminPartyId },
    });

    await tx.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        eventType: 'mandate_decided',
        subjectRef: mandate.id,
        payload: {
          decision: params.decision,
          note: note ?? null,
          propertyId: mandate.propertyId,
          listerPartyId: mandate.listerPartyId,
        },
        occurredAt: new Date(),
      },
    });

    return updated;
  });
}

/**
 * The ops queue for one state. The decision note is NOT served here -
 * it lives in the audit trail (action `mandate_decided`), and re-serving
 * it would be a second copy that can drift from what was actually
 * recorded.
 */
export async function findMandatesForOps(filter: { state?: 'pending' | 'verified' | 'rejected' }) {
  const rows = await db.propertyMandate.findMany({
    where: filter.state ? { state: filter.state } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      property: { include: { neighbourhood: true, ownerParty: { select: { displayName: true } } } },
      listerParty: { include: { listerProfile: true } },
    },
  });

  return rows.map((m) => ({
    id: m.id,
    state: m.state,
    // The production row has no note column; see findMandatesForLister.
    note: null as string | null,
    createdAt: m.createdAt.toISOString(),
    decidedAt: m.verifiedAt?.toISOString() ?? null,
    property: {
      id: m.property.id,
      landmarkText: m.property.landmarkText,
      neighbourhoodName: m.property.neighbourhood.name,
      ownerId: m.property.ownerPartyId,
      ownerName: m.property.ownerParty.displayName,
    },
    // Task 14: ops surfaces link rows to the account detail page, so the
    // queue carries the ids (the landlord's own panel never needed them).
    listerPartyId: m.listerPartyId,
    listerName: m.listerParty.displayName,
    listerTier: m.listerParty.listerProfile?.tier ?? null,
  }));
}
