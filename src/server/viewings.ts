/**
 * Field operations: viewing requests, dispatch, structured field reports,
 * introduction records, and listing verification/availability.
 *
 * Ported from apps/api/src/viewings. The load-bearing rules:
 *  - A tenant must be identity-verified before requesting a viewing
 *    (invariant 6, SSOT Decision 10 — identity is the universal baseline).
 *  - The viewing graph is frozen: `conducted` is TERMINAL (retroactively
 *    denying an introduction that demonstrably happened would destroy the
 *    circumvention evidence), and there is no `requested → conducted` edge,
 *    so a conducted viewing always has an officer.
 *  - `conduct()` refuses without a field report, then writes the immutable
 *    introduction record and the status change together. The landlord on
 *    the record is derived from the property server-side — no party chose
 *    what the evidence says.
 *  - Field reports are STRUCTURED (conditionRating/matchesListing/isAvailable),
 *    not free text — they become the baseline for partner standards.
 */
import { db } from '@/lib/db';
import { assertViewingTransitionAllowed } from './viewing-state-machine';
import type { ConditionRating } from './domain';

// ── errors ───────────────────────────────────────────────────────────────

export class TenantNotVerifiedError extends Error {
  constructor(partyId: string) {
    super(
      `tenant ${partyId} has no verified identity check. A viewing is requested ` +
        'only after identity verification — the universal baseline (SSOT Decision 10).',
    );
    this.name = 'TenantNotVerifiedError';
  }
}
export class FieldReportRequiredError extends Error {
  constructor(viewingId: string) {
    super(`viewing ${viewingId} has no field report. A viewing is conducted only once the officer has filed one.`);
    this.name = 'FieldReportRequiredError';
  }
}
export class ViewingNotFoundError extends Error {
  constructor(id: string) {
    super(`viewing ${id} not found`);
    this.name = 'ViewingNotFoundError';
  }
}
export class NotAssignedOfficerError extends Error {
  constructor(viewingId: string) {
    super(`viewing ${viewingId} is assigned to a different officer`);
    this.name = 'NotAssignedOfficerError';
  }
}
export class NotYourViewingError extends Error {
  constructor(viewingId: string) {
    super(
      `viewing ${viewingId} belongs to a different tenant. A viewing is ` +
        'cancelled by the tenant who requested it.',
    );
    this.name = 'NotYourViewingError';
  }
}

// ── tenant side ──────────────────────────────────────────────────────────

/** FR-5.1 — the tenant asks; the platform schedules and dispatches. */
export async function requestViewing(params: {
  listingId: string;
  tenantPartyId: string;
  scheduledFor: Date;
}) {
  const verification = await db.identityVerification.findFirst({
    where: { partyId: params.tenantPartyId, state: 'verified' },
  });
  if (!verification) throw new TenantNotVerifiedError(params.tenantPartyId);

  const listing = await db.listing.findUnique({
    where: { id: params.listingId },
    include: { property: { include: { neighbourhood: true } } },
  });
  if (!listing) throw new ViewingNotFoundError(params.listingId);
  if (listing.publicationState !== 'live') {
    throw new Error('this listing is not open for viewing requests');
  }

  return db.viewing.create({
    data: {
      listingId: params.listingId,
      tenantPartyId: params.tenantPartyId,
      scheduledFor: params.scheduledFor,
      status: 'requested',
    },
  });
}

/**
 * A tenant's own viewings, WITH the property behind them, and
 * `whatHappensNext` written HERE server-side — one place knows what
 * "requested" means to the person waiting.
 */
export async function findForTenant(tenantPartyId: string) {
  const viewings = await db.viewing.findMany({
    where: { tenantPartyId },
    orderBy: { scheduledFor: 'desc' },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      fieldReport: true,
      introductionRecord: true,
      conductedBy: { select: { displayName: true } },
    },
  });

  return viewings.map((v) => ({
    id: v.id,
    listingId: v.listingId,
    status: v.status,
    scheduledFor: v.scheduledFor,
    listing: {
      monthlyRent: v.listing.monthlyRent.toString(),
      bedrooms: v.listing.property.bedrooms,
      propertyType: v.listing.property.propertyType,
      neighbourhoodName: v.listing.property.neighbourhood.name,
      landmarkText: v.listing.property.landmarkText,
    },
    conductedBy: v.conductedBy?.displayName ?? null,
    hasFieldReport: Boolean(v.fieldReport),
    hasIntroduction: Boolean(v.introductionRecord),
    whatHappensNext: nextStepFor(v.status),
  }));
}

function nextStepFor(status: string): string {
  switch (status) {
    case 'requested':
      return 'Our team will confirm a time with you and assign a field officer.';
    case 'scheduled':
      return 'A field officer has been assigned. Be at the landmark at the scheduled time.';
    case 'conducted':
      return 'The visit happened and your introduction to the landlord is on record. You can open a deal from this viewing when you are ready.';
    case 'no_show':
      return 'The officer could not reach you at the scheduled time. Request another viewing when you are ready.';
    case 'cancelled':
      // Deliberately NOT "You cancelled" — operations also cancels
      // viewings (the landlord-reported case), and a sentence addressed to
      // the wrong actor is a small lie. WHO cancelled lives in the audit
      // trail; the tenant sees the state and the way back.
      return 'This viewing was cancelled. You can request another one whenever you are ready.';
    default:
      return 'This viewing is closed.';
  }
}

// ── staff side ───────────────────────────────────────────────────────────

/** The dispatch queue: requested viewings waiting for an officer. */
export async function dispatchQueue() {
  const rows = await db.viewing.findMany({
    where: { status: 'requested' },
    orderBy: { scheduledFor: 'asc' },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
    },
  });
  return rows.map((v) => ({
    id: v.id,
    scheduledFor: v.scheduledFor,
    requestedAt: v.createdAt,
    tenantName: v.tenantParty.displayName,
    neighbourhood: v.listing.property.neighbourhood.name,
    landmarkText: v.listing.property.landmarkText,
    bedrooms: v.listing.property.bedrooms,
    monthlyRent: v.listing.monthlyRent.toString(),
    listingId: v.listingId,
  }));
}

/** FR-5.1 — an admin assigns an officer and confirms the time. */
export async function dispatchViewing(params: {
  viewingId: string;
  fooPartyId: string;
  scheduledFor: Date;
}) {
  const viewing = await db.viewing.findUnique({ where: { id: params.viewingId } });
  if (!viewing) throw new ViewingNotFoundError(params.viewingId);
  assertViewingTransitionAllowed(viewing.status as never, 'scheduled');

  const officer = await db.party.findUnique({ where: { id: params.fooPartyId } });
  if (!officer) throw new Error('officer not found');

  return db.viewing.update({
    where: { id: params.viewingId },
    data: {
      status: 'scheduled',
      conductedByPartyId: params.fooPartyId,
      scheduledFor: params.scheduledFor,
    },
  });
}

/** Today's field list for an officer (and everything still open). */
export async function findForOfficer(fooPartyId: string) {
  const rows = await db.viewing.findMany({
    where: { conductedByPartyId: fooPartyId, status: { in: ['scheduled'] } },
    orderBy: { scheduledFor: 'asc' },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      fieldReport: true,
      introductionRecord: true,
    },
  });
  return rows.map((v) => ({
    id: v.id,
    scheduledFor: v.scheduledFor,
    status: v.status,
    tenantName: v.tenantParty.displayName,
    listing: {
      id: v.listing.id,
      monthlyRent: v.listing.monthlyRent.toString(),
      bedrooms: v.listing.property.bedrooms,
      bathrooms: v.listing.property.bathrooms,
      neighbourhoodName: v.listing.property.neighbourhood.name,
      landmarkText: v.listing.property.landmarkText,
      propertyId: v.listing.propertyId,
      verificationState: v.listing.verificationState,
    },
    hasFieldReport: Boolean(v.fieldReport),
    hasIntroduction: Boolean(v.introductionRecord),
  }));
}

export async function getViewingDetail(viewingId: string) {
  const v = await db.viewing.findUnique({
    where: { id: viewingId },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      conductedBy: { select: { displayName: true } },
      fieldReport: true,
      introductionRecord: true,
    },
  });
  if (!v) throw new ViewingNotFoundError(viewingId);
  return {
    id: v.id,
    status: v.status,
    scheduledFor: v.scheduledFor,
    tenantName: v.tenantParty.displayName,
    conductedByName: v.conductedBy?.displayName ?? null,
    listing: {
      id: v.listing.id,
      monthlyRent: v.listing.monthlyRent.toString(),
      requiredMonthsUpfront: v.listing.requiredMonthsUpfront,
      depositAmount: v.listing.depositAmount.toString(),
      bedrooms: v.listing.property.bedrooms,
      bathrooms: v.listing.property.bathrooms,
      propertyType: v.listing.property.propertyType,
      furnished: v.listing.property.furnished,
      neighbourhoodName: v.listing.property.neighbourhood.name,
      landmarkText: v.listing.property.landmarkText,
      /** Part of the "is this listing publicly visible right now"
       * predicate (with publicationState + verificationState) that decides
       * whether the visit record may show the officer a working
       * public-listing link rather than a dead one. */
      inServiceArea: v.listing.property.neighbourhood.inServiceArea,
      propertyId: v.listing.propertyId,
      verificationState: v.listing.verificationState,
      availabilityStatus: v.listing.availabilityStatus,
      publicationState: v.listing.publicationState,
      listerPartyId: v.listing.property.ownerPartyId,
    },
    fieldReport: v.fieldReport
      ? {
          conditionRating: v.fieldReport.conditionRating,
          matchesListing: v.fieldReport.matchesListing,
          isAvailable: v.fieldReport.isAvailable,
          issuesText: v.fieldReport.issuesText,
          timingNote: v.fieldReport.timingNote,
          reportedAt: v.fieldReport.reportedAt,
        }
      : null,
    introductionRecord: v.introductionRecord
      ? { id: v.introductionRecord.id, introducedAt: v.introductionRecord.introducedAt }
      : null,
  };
}

/** Files the structured visit report (immutable). */
export async function fileFieldReport(params: {
  viewingId: string;
  fooPartyId: string;
  conditionRating: ConditionRating;
  matchesListing: boolean;
  isAvailable: boolean;
  issuesText?: string;
  timingNote?: string;
}) {
  const viewing = await db.viewing.findUnique({ where: { id: params.viewingId } });
  if (!viewing) throw new ViewingNotFoundError(params.viewingId);
  if (viewing.status !== 'scheduled') {
    throw new Error('a field report is filed on a scheduled viewing');
  }
  if (viewing.conductedByPartyId && viewing.conductedByPartyId !== params.fooPartyId) {
    throw new NotAssignedOfficerError(params.viewingId);
  }
  if (viewing.conductedByPartyId !== params.fooPartyId) {
    // Assign-on-report: an officer who files the visit owns it.
    await db.viewing.update({
      where: { id: params.viewingId },
      data: { conductedByPartyId: params.fooPartyId },
    });
  }

  const existing = await db.fieldReport.findUnique({ where: { viewingId: params.viewingId } });
  if (existing) throw new Error('a field report already exists for this viewing — corrections are new evidence, not edits');

  return db.fieldReport.create({
    data: {
      viewingId: params.viewingId,
      fooPartyId: params.fooPartyId,
      conditionRating: params.conditionRating,
      matchesListing: params.matchesListing,
      isAvailable: params.isAvailable,
      issuesText: params.issuesText,
      timingNote: params.timingNote,
      mediaAssetIds: JSON.stringify([]),
      reportedAt: new Date(),
    },
  });
}

/**
 * FR-5.3 — conducting the viewing. THE stage invariant. Refuses without a
 * field report, then writes the immutable introduction record and the
 * status change together.
 */
export async function conduct(params: { viewingId: string; fooPartyId: string; introducedAt?: Date }) {
  return db.$transaction(async (tx) => {
    const viewing = await tx.viewing.findUnique({ where: { id: params.viewingId } });
    if (!viewing) throw new ViewingNotFoundError(params.viewingId);
    if (viewing.conductedByPartyId && viewing.conductedByPartyId !== params.fooPartyId) {
      throw new NotAssignedOfficerError(params.viewingId);
    }
    assertViewingTransitionAllowed(viewing.status as never, 'conducted');

    const report = await tx.fieldReport.findUnique({ where: { viewingId: params.viewingId } });
    if (!report) throw new FieldReportRequiredError(params.viewingId);

    const listing = await tx.listing.findUniqueOrThrow({
      where: { id: viewing.listingId },
      include: { property: true },
    });

    const introduction = await tx.introductionRecord.create({
      data: {
        viewingId: viewing.id,
        tenantPartyId: viewing.tenantPartyId,
        listingId: viewing.listingId,
        landlordPartyId: listing.property.ownerPartyId,
        fooPartyId: params.fooPartyId,
        introducedAt: params.introducedAt ?? new Date(),
      },
    });

    const updated = await tx.viewing.update({
      where: { id: viewing.id },
      data: { status: 'conducted' },
    });

    return { viewing: updated, introduction };
  });
}

/** FR-5.2 — no-shows are tracked, not deleted. */
export async function markNoShow(params: { viewingId: string; fooPartyId: string }) {
  const viewing = await db.viewing.findUnique({ where: { id: params.viewingId } });
  if (!viewing) throw new ViewingNotFoundError(params.viewingId);
  assertViewingTransitionAllowed(viewing.status as never, 'no_show');
  return db.viewing.update({ where: { id: params.viewingId }, data: { status: 'no_show' } });
}

/**
 * The tenant withdraws a viewing while it is still `requested` or
 * `scheduled`.
 *
 * ── The rules the state machine already decided ──
 * The transition graph allows requested/scheduled → cancelled and nothing
 * else out of those states; `conducted` is terminal, so a visit that
 * happened can never be retroactively "cancelled" — that record is the
 * circumvention evidence and it does not bend to anyone's convenience.
 * The cancelled row is kept, not deleted: the landlord's viewing activity
 * shows it as cancelled, which is the honest version of "nobody turned
 * up".
 *
 * The decision is the tenant's, so the audit trail carries the actor —
 * ops can distinguish a tenant's own cancellation from an officer's
 * no_show without guessing.
 */
export async function cancelViewing(params: { viewingId: string; tenantPartyId: string }) {
  const viewing = await db.viewing.findUnique({ where: { id: params.viewingId } });
  if (!viewing) throw new ViewingNotFoundError(params.viewingId);
  if (viewing.tenantPartyId !== params.tenantPartyId) {
    throw new NotYourViewingError(params.viewingId);
  }
  assertViewingTransitionAllowed(viewing.status as never, 'cancelled');

  const [updated] = await db.$transaction([
    db.viewing.update({
      where: { id: params.viewingId },
      data: { status: 'cancelled' },
    }),
    db.auditEvent.create({
      data: {
        actorPartyId: params.tenantPartyId,
        actorRole: 'tenant',
        action: 'viewing_cancelled',
        entityType: 'viewing',
        entityId: params.viewingId,
        detail: JSON.stringify({
          from: viewing.status,
          listingId: viewing.listingId,
        }),
      },
    }),
  ]);
  return updated;
}

/**
 * Operations cancels a viewing — the landlord-reported case. The owner
 * says the home is let, or the arrangement fell through; the request must
 * leave the queue without rewriting history. The same frozen graph
 * applies (requested/scheduled only — a conducted visit is evidence), and
 * the audit detail names OPERATIONS as the actor so a tenant's own
 * cancellation and an ops cancellation stay distinguishable forever.
 */
export async function opsCancelViewing(params: {
  viewingId: string;
  adminPartyId: string;
  note?: string;
}) {
  const viewing = await db.viewing.findUnique({ where: { id: params.viewingId } });
  if (!viewing) throw new ViewingNotFoundError(params.viewingId);
  assertViewingTransitionAllowed(viewing.status as never, 'cancelled');

  const [updated] = await db.$transaction([
    db.viewing.update({
      where: { id: params.viewingId },
      data: { status: 'cancelled' },
    }),
    db.auditEvent.create({
      data: {
        actorPartyId: params.adminPartyId,
        actorRole: 'admin',
        action: 'viewing_cancelled',
        entityType: 'viewing',
        entityId: params.viewingId,
        detail: JSON.stringify({
          from: viewing.status,
          listingId: viewing.listingId,
          by: 'operations',
          note: params.note ?? null,
        }),
      },
    }),
  ]);
  return updated;
}

/**
 * The officer's verification verdict on the listing they visited:
 * verification state, availability, and the freshness clock.
 */
export async function verifyListingFromVisit(params: {
  listingId: string;
  fooPartyId: string;
  verified: boolean;
  available: boolean;
  note?: string;
}) {
  return db.$transaction(async (tx) => {
    const listing = await tx.listing.update({
      where: { id: params.listingId },
      data: {
        verificationState: params.verified ? 'verified' : 'unverified',
        availabilityStatus: params.available ? 'available' : 'unavailable',
        availabilityConfirmedAt: new Date(),
      },
    });
    await tx.auditEvent.create({
      data: {
        actorPartyId: params.fooPartyId,
        actorRole: 'foo',
        action: 'listing_verification',
        entityType: 'listing',
        entityId: params.listingId,
        detail: JSON.stringify({ verificationState: listing.verificationState, available: params.available, note: params.note ?? null }),
      },
    });
    return listing;
  });
}

/**
 * FR-5.3 / FR-8.3 — introduction records as queryable circumvention
 * evidence. Read directly, not through `deal`: the evidence exists
 * precisely for the case where no deal was ever created.
 */
export async function findIntroductions(filter: { fooPartyId?: string; listingId?: string; tenantPartyId?: string }) {
  return db.introductionRecord.findMany({
    where: {
      fooPartyId: filter.fooPartyId,
      listingId: filter.listingId,
      tenantPartyId: filter.tenantPartyId,
    },
    orderBy: { introducedAt: 'desc' },
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      landlordParty: { select: { displayName: true } },
      viewing: { select: { id: true, status: true } },
    },
  });
}

/**
 * Viewing activity on a LANDLORD's own listings (brief §6: "viewing
 * activity", "prospective tenants").
 *
 * Read-only by design: scheduling and dispatch are House For Rent's
 * operational work (Decision 9 — company-conducted viewings), so the
 * landlord sees who is coming and what happened, and does not dispatch.
 * No phone numbers: the officer mediates contact (data minimisation).
 */
export async function findViewingsForLister(listerPartyId: string) {
  const rows = await db.viewing.findMany({
    where: { listing: { property: { ownerPartyId: listerPartyId } } },
    orderBy: { scheduledFor: 'desc' },
    take: 30,
    include: {
      listing: { include: { property: { include: { neighbourhood: true } } } },
      tenantParty: { select: { displayName: true } },
      conductedBy: { select: { displayName: true } },
      fieldReport: { select: { conditionRating: true, matchesListing: true, isAvailable: true } },
    },
  });

  return rows.map((v) => ({
    id: v.id,
    status: v.status,
    scheduledFor: v.scheduledFor.toISOString(),
    requestedAt: v.createdAt.toISOString(),
    tenantName: v.tenantParty.displayName,
    officerName: v.conductedBy?.displayName ?? null,
    listing: {
      id: v.listing.id,
      bedrooms: v.listing.property.bedrooms,
      propertyType: v.listing.property.propertyType,
      neighbourhoodName: v.listing.property.neighbourhood.name,
      landmarkText: v.listing.property.landmarkText,
      monthlyRent: v.listing.monthlyRent.toString(),
    },
    fieldReport: v.fieldReport
      ? {
          conditionRating: v.fieldReport.conditionRating,
          matchesListing: v.fieldReport.matchesListing,
          isAvailable: v.fieldReport.isAvailable,
        }
      : null,
  }));
}
