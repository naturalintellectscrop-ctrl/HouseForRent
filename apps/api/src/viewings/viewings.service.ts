import { Injectable } from '@nestjs/common';
import {
  ConditionRating,
  FieldReport,
  IntroductionRecord,
  Prisma,
  Viewing,
  ViewingStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { ListingNotFoundError } from '../listings/listings.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../audit/audit.service';
import type { MediaKindName } from '../media/interfaces/media-storage-provider.interface';
import { assertViewingTransitionAllowed } from './viewing-state-machine';

type Tx = Prisma.TransactionClient;

export class ViewingNotFoundError extends Error {
  constructor(viewingId: string) {
    super(`viewing ${viewingId} not found`);
    this.name = 'ViewingNotFoundError';
  }
}

export class TenantNotVerifiedError extends Error {
  constructor(tenantPartyId: string) {
    super(
      `party ${tenantPartyId} cannot request a viewing: identity verification ` +
        'is incomplete. A field officer is dispatched to meet this person in ' +
        'a stranger\'s home, so "verified tenant" is a precondition, not a ' +
        'nice-to-have (FR-5.1).',
    );
    this.name = 'TenantNotVerifiedError';
  }
}

export class ListingNotViewableError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} is not live, so no viewing can be requested ` +
        'against it. Dispatching an officer to a withdrawn or unpublished ' +
        'listing wastes a visit on a property nobody can rent (FR-4.1).',
    );
    this.name = 'ListingNotViewableError';
  }
}

export class OutsideServiceCorridorError extends Error {
  constructor(viewingId: string) {
    super(
      `viewing ${viewingId} cannot be assigned: its listing sits outside the ` +
        'active service corridor. Dispatch is corridor-bounded (FR-5.2, ' +
        'Decision 2).',
    );
    this.name = 'OutsideServiceCorridorError';
  }
}

export class NotAFieldOfficerError extends Error {
  constructor(partyId: string) {
    super(
      `party ${partyId} cannot be assigned a viewing: they hold no "foo" ` +
        'account. V1 permits only field officers to conduct viewings; the ' +
        'certified-partner role is a seam, not an active capability ' +
        '(FR-5.6, Decision 9).',
    );
    this.name = 'NotAFieldOfficerError';
  }
}

export class FieldReportRequiredError extends Error {
  constructor(viewingId: string) {
    super(
      `viewing ${viewingId} cannot be conducted: no structured field report ` +
        'exists. A viewing is not closable without one (FR-5.4, ' +
        'Data_Model.md §5.1 invariant).',
    );
    this.name = 'FieldReportRequiredError';
  }
}

export class FieldReportAlreadyFiledError extends Error {
  constructor(viewingId: string) {
    super(
      `viewing ${viewingId} already has a field report. A report is the ` +
        "officer's on-site observation at a point in time; revising it " +
        'would let a later opinion overwrite what was actually seen.',
    );
    this.name = 'FieldReportAlreadyFiledError';
  }
}

export interface ConductedViewing {
  viewing: Viewing;
  introduction: IntroductionRecord;
}

/**
 * Viewings and field operations (Data_Model.md §5, PRD FR-5.x).
 *
 * Every operation is a named business method — there is deliberately no
 * generic `setStatus()`, for the same reason DealsService has none: it
 * would let a caller route around the guard that makes each transition
 * safe.
 *
 * THE invariant of this stage, from Data_Model.md §5.1:
 *
 *   "A viewing cannot move to `conducted` without (a) an introduction_record
 *    and (b) a field_report (FR-5.3, FR-5.4)."
 *
 * `conduct()` enforces it structurally: the field report must ALREADY exist
 * (checked, and rejected with FieldReportRequiredError if not), and the
 * introduction record is written in the SAME transaction as the status
 * change. There is no ordering in which a `conducted` row can be observed
 * without both artefacts, and no second code path to that status.
 */
/**
 * What the tenant is waiting for, per status.
 *
 * ── Why this lives on the server ──
 * It is a statement about what the platform will do next, which is a fact
 * about the state machine rather than about presentation. A client holding
 * its own map would be a second, quieter copy of the viewing lifecycle —
 * and the one that keeps saying "an officer is being assigned" after the
 * transition graph changed.
 */
const WHAT_HAPPENS_NEXT: Record<ViewingStatus, string> = {
  requested:
    'Our operations desk is assigning a field officer. We will confirm the time with you.',
  scheduled:
    'An officer is booked to meet you at the property. Come at the confirmed time.',
  conducted:
    'The visit is done and your introduction to the landlord is recorded. If you want the property, we take it from here.',
  no_show:
    'This visit was recorded as a no-show. Request another time if you still want to see the property.',
  cancelled: 'This viewing was cancelled.',
};

@Injectable()
export class ViewingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * FR-5.1 — a verified tenant requests a viewing.
   *
   * Lands in `requested`, not `scheduled`: no officer has been dispatched
   * yet, and `assign()` is what schedules it (API Spec §4.3). The tenant
   * proposes the time; dispatch confirms or moves it at assignment.
   */
  async requestViewing(params: {
    listingId: string;
    tenantPartyId: string;
    scheduledFor: Date;
  }): Promise<Viewing> {
    const verified = await this.identity.isIdentityVerified(
      params.tenantPartyId,
    );
    if (!verified) {
      throw new TenantNotVerifiedError(params.tenantPartyId);
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: params.listingId },
    });
    if (!listing) {
      throw new ListingNotFoundError(params.listingId);
    }
    if (listing.publicationState !== 'live') {
      throw new ListingNotViewableError(params.listingId);
    }

    return this.prisma.viewing.create({
      data: {
        listingId: params.listingId,
        tenantPartyId: params.tenantPartyId,
        scheduledFor: params.scheduledFor,
        // status defaults to 'requested'; conductedByPartyId stays null
        // until dispatch, which is why there is no requested → conducted edge
      },
    });
  }

  /**
   * FR-5.2 — dispatch. Assigns a field officer, within the corridor.
   *
   * Both checks are server-side and independent of the caller's claims: the
   * assignee must genuinely hold a `foo` account, and the listing must sit
   * in the service corridor. Re-assignment before the visit is permitted
   * (`scheduled → scheduled`); after it is not.
   */
  async assign(params: {
    viewingId: string;
    fooPartyId: string;
    scheduledFor?: Date;
  }): Promise<Viewing> {
    return this.prisma.$transaction(async (tx) => {
      const viewing = await this.loadForUpdate(params.viewingId, tx);
      assertViewingTransitionAllowed(viewing.status, 'scheduled');

      const account = await tx.userAccount.findFirst({
        where: { partyId: params.fooPartyId, authRole: 'foo' },
      });
      if (!account) {
        throw new NotAFieldOfficerError(params.fooPartyId);
      }

      const listing = await tx.listing.findUniqueOrThrow({
        where: { id: viewing.listingId },
        include: { property: { include: { neighbourhood: true } } },
      });
      if (!listing.property.neighbourhood.inServiceArea) {
        throw new OutsideServiceCorridorError(params.viewingId);
      }

      return tx.viewing.update({
        where: { id: params.viewingId },
        data: {
          conductedByPartyId: params.fooPartyId,
          // conductedByRole stays 'foo' — V1 permits no other value. The
          // seam is the enum, not a branch here (FR-5.6).
          conductedByRole: 'foo',
          scheduledFor: params.scheduledFor ?? viewing.scheduledFor,
          status: 'scheduled',
        },
      });
    });
  }

  /**
   * FR-5.4 — the structured field report.
   *
   * `conditionRating`, `matchesListing` and `isAvailable` are structured
   * enums/booleans; the free-text fields are optional annotations that
   * nothing downstream reads as data. That is the point: you cannot certify
   * a partner against a standard you only ever recorded as prose
   * (Decision 9).
   *
   * Writing the report ALSO writes back to the listing, in one transaction
   * (FR-5.4 AC, Data_Model.md §5.3):
   *   - availability + freshness clock, from `isAvailable` — either way, a
   *     physical visit is what refreshes the clock (FR-2.3);
   *   - verification state, from `matchesListing` — this is what makes
   *     "verification originates from a field visit" true rather than
   *     merely intended (FR-5.5).
   *
   * A report is filed once. It is an observation at a moment, not a
   * document under revision.
   */
  async submitFieldReport(params: {
    viewingId: string;
    fooPartyId: string;
    conditionRating: ConditionRating;
    matchesListing: boolean;
    isAvailable: boolean;
    issuesText?: string;
    timingNote?: string;
    mediaAssetIds?: string[];
    reportedAt?: Date;
  }): Promise<FieldReport> {
    return this.prisma.$transaction(async (tx) => {
      const viewing = await this.loadForUpdate(params.viewingId, tx);

      // Only a dispatched, not-yet-closed viewing can be reported on.
      assertViewingTransitionAllowed(viewing.status, 'conducted');

      const existing = await tx.fieldReport.findUnique({
        where: { viewingId: params.viewingId },
      });
      if (existing) {
        throw new FieldReportAlreadyFiledError(params.viewingId);
      }

      const report = await tx.fieldReport.create({
        data: {
          viewingId: params.viewingId,
          fooPartyId: params.fooPartyId,
          conditionRating: params.conditionRating,
          matchesListing: params.matchesListing,
          isAvailable: params.isAvailable,
          issuesText: params.issuesText,
          timingNote: params.timingNote,
          mediaAssetIds: params.mediaAssetIds ?? [],
          reportedAt: params.reportedAt ?? new Date(),
        },
      });

      await tx.listing.update({
        where: { id: viewing.listingId },
        data: {
          availabilityStatus: params.isAvailable ? 'available' : 'unavailable',
          availabilityConfirmedAt: report.reportedAt,
          // An officer who found the property NOT as listed removes its
          // verified standing, so it cannot be (re)published on the strength
          // of a check that has since been contradicted (FR-3.1, FR-5.5).
          //
          // It deliberately does NOT auto-withdraw a live listing:
          // withdrawing inventory is an ops decision nobody has taken, and
          // inventing one here is exactly the silent business-rule invention
          // this build avoids. An admin/FOO calls withdraw().
          verificationState: params.matchesListing ? 'verified' : 'unverified',
        },
      });

      // NFR-2: this path changes a listing's verification state, so it is a
      // verification event in its own right — auditing only the explicit
      // `verify` endpoint would leave the field-visit route, which is the
      // one that actually reflects an inspection, invisible.
      await this.audit.record(
        {
          eventType: 'listing_verified',
          actorPartyId: params.fooPartyId,
          subjectRef: viewing.listingId,
          payload: {
            via: 'field_report',
            viewingId: viewing.id,
            matchesListing: params.matchesListing,
            isAvailable: params.isAvailable,
            conditionRating: params.conditionRating,
            verificationState: params.matchesListing
              ? 'verified'
              : 'unverified',
          },
          occurredAt: report.reportedAt,
        },
        tx,
      );

      return report;
    });
  }

  /**
   * FR-5.3 — conducting the viewing. THE stage invariant.
   *
   * Refuses without a field report, then writes the immutable introduction
   * record and the status change together. The record links tenant ↔
   * property ↔ landlord ↔ FOO ↔ time, and its landlord is derived from the
   * property server-side — never supplied by a caller, since the whole
   * value of the evidence is that no party chose what it says.
   */
  async conduct(params: {
    viewingId: string;
    fooPartyId: string;
    introducedAt?: Date;
  }): Promise<ConductedViewing> {
    return this.prisma.$transaction(async (tx) => {
      const viewing = await this.loadForUpdate(params.viewingId, tx);
      assertViewingTransitionAllowed(viewing.status, 'conducted');

      const report = await tx.fieldReport.findUnique({
        where: { viewingId: params.viewingId },
      });
      if (!report) {
        throw new FieldReportRequiredError(params.viewingId);
      }

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
  async markNoShow(params: { viewingId: string }): Promise<Viewing> {
    return this.prisma.$transaction(async (tx) => {
      const viewing = await this.loadForUpdate(params.viewingId, tx);
      assertViewingTransitionAllowed(viewing.status, 'no_show');
      return tx.viewing.update({
        where: { id: viewing.id },
        data: { status: 'no_show' },
      });
    });
  }

  /**
   * FR-5.5 — professional media captured during the field visit.
   *
   * Delegates the ladder and its ceilings to MediaService rather than
   * reimplementing them, so "compressed for low bandwidth" means one thing
   * across the system.
   */
  async captureMedia(params: {
    viewingId: string;
    fooPartyId: string;
    kind: MediaKindName;
    mimeType: string;
    sourceByteSize: number;
    sourceRef: string;
  }) {
    await this.getViewingOrThrow(params.viewingId);
    return this.media.capture({
      capturedByPartyId: params.fooPartyId,
      kind: params.kind,
      mimeType: params.mimeType,
      sourceByteSize: params.sourceByteSize,
      sourceRef: params.sourceRef,
    });
  }

  /**
   * FR-5.3 / FR-8.3 — introduction records as queryable circumvention
   * evidence.
   *
   * Reads `introduction_record` directly rather than joining through
   * `deal`, because the evidence exists precisely for the case where no
   * deal was ever created: a landlord and tenant who transacted around the
   * platform leave no deal row, but they do leave this one
   * (Data_Model.md §5.2).
   */
  async findIntroductions(filter: {
    tenantPartyId?: string;
    landlordPartyId?: string;
    listingId?: string;
    fooPartyId?: string;
  }): Promise<IntroductionRecord[]> {
    return this.prisma.introductionRecord.findMany({
      where: {
        tenantPartyId: filter.tenantPartyId,
        landlordPartyId: filter.landlordPartyId,
        listingId: filter.listingId,
        fooPartyId: filter.fooPartyId,
      },
      orderBy: { introducedAt: 'desc' },
    });
  }

  /**
   * A tenant's own viewings (FR-5.1) — including closed ones, because
   * "the officer marked you as a no-show" is exactly the outcome a tenant
   * needs to be able to see.
   */
  /**
   * A tenant's own viewings, WITH enough of the property to recognise them.
   *
   * ── Why this returns more than the row ──
   * It used to return bare `Viewing` records: an id, a listing id, a status
   * and a time. A tenant looking at that has no way to tell which of three
   * requests is the flat in Ntinda — the surface would have to fetch every
   * listing separately, or worse, hold its own copy of the listing data.
   * Widening the contract is the right fix; making the client do joins is
   * not.
   *
   * `whatHappensNext` is written HERE, server-side, from the viewing's own
   * status. The client renders the sentence rather than switching on the
   * status itself, so there is one place that knows what "requested" means
   * to the person waiting.
   */
  async findForTenant(tenantPartyId: string) {
    const viewings = await this.prisma.viewing.findMany({
      where: { tenantPartyId },
      orderBy: { scheduledFor: 'desc' },
      include: {
        listing: {
          include: { property: { include: { neighbourhood: true } } },
        },
      },
    });

    return viewings.map((v) => ({
      id: v.id,
      listingId: v.listingId,
      status: v.status,
      scheduledFor: v.scheduledFor,
      createdAt: v.createdAt,
      /** Null until dispatch assigns one — never a placeholder name. */
      officerAssigned: v.conductedByPartyId !== null,
      listing: {
        monthlyRent: v.listing.monthlyRent,
        bedrooms: v.listing.property.bedrooms,
        bathrooms: v.listing.property.bathrooms,
        propertyType: v.listing.property.propertyType,
        neighbourhoodName: v.listing.property.neighbourhood.name,
        landmarkText: v.listing.property.landmarkText,
        publicationState: v.listing.publicationState,
      },
      whatHappensNext: WHAT_HAPPENS_NEXT[v.status],
    }));
  }

  /** The dispatch board for an officer (FR-5.2). */
  async findAssignedTo(fooPartyId: string): Promise<Viewing[]> {
    return this.prisma.viewing.findMany({
      where: { conductedByPartyId: fooPartyId, status: 'scheduled' },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  /**
   * FR-5.2 — the DISPATCHER's queue: viewings a tenant has requested and
   * nobody has been sent to yet.
   *
   * ── Why this exists ──
   * `findAssignedTo` answers "what am I going to?", scoped to the caller. It
   * has no answer to "what has nobody been sent to?", and without that
   * question being askable a requested viewing was unreachable: the assign
   * endpoint existed, was tested, and could not be called because no surface
   * could name a viewing to assign. The tenant journey stopped there.
   *
   * ── Why it returns a projection rather than rows ──
   * `assign()` refuses a listing outside the service corridor, so a queue of
   * bare viewings would let a dispatcher pick a row that is guaranteed to be
   * rejected, with no way to see why beforehand. `inServiceArea` is computed
   * HERE, from the same neighbourhood flag the guard reads, so the console
   * renders the server's judgement instead of re-deriving one that could
   * drift (Technical Architecture §7).
   */
  async findDispatchQueue(): Promise<
    Array<{
      viewing: Viewing;
      listingId: string;
      neighbourhood: string;
      inServiceArea: boolean;
      /** Why this row cannot be assigned yet — empty means it can. */
      blockedBy: string[];
    }>
  > {
    const rows = await this.prisma.viewing.findMany({
      where: { status: 'requested' },
      orderBy: { scheduledFor: 'asc' },
      include: {
        listing: {
          include: { property: { include: { neighbourhood: true } } },
        },
      },
    });

    return rows.map(({ listing, ...viewing }) => {
      const neighbourhood = listing.property.neighbourhood;
      const blockedBy: string[] = [];
      if (!neighbourhood.inServiceArea) {
        blockedBy.push('outside_service_area');
      }
      // A listing withdrawn since the request means the visit is wasted.
      // Reported, not hidden: the dispatcher needs to see the row to know
      // why the tenant is waiting.
      if (listing.publicationState !== 'live') {
        blockedBy.push('listing_not_live');
      }
      return {
        viewing,
        listingId: listing.id,
        neighbourhood: neighbourhood.name,
        inServiceArea: neighbourhood.inServiceArea,
        blockedBy,
      };
    });
  }

  /**
   * The officers a viewing may be assigned to (FR-5.2, FR-5.6).
   *
   * V1 permits only `foo` accounts to conduct viewings, and `assign()`
   * enforces that server-side against `user_account`. This reads the same
   * table, so the dropdown a dispatcher sees cannot contain someone the
   * assignment would then refuse.
   *
   * Deliberately returns no phone number. A dispatcher needs a name to
   * choose from, not a roster of staff contact details, and the smallest
   * projection that answers the question is the one that leaks least
   * (NFR-3).
   */
  async findAssignableOfficers(): Promise<
    Array<{ partyId: string; displayName: string; assignedCount: number }>
  > {
    const accounts = await this.prisma.userAccount.findMany({
      where: { authRole: 'foo', party: { status: 'active' } },
      include: { party: true },
    });

    // Current workload, so dispatch is not blind to who is already loaded.
    const load = await this.prisma.viewing.groupBy({
      by: ['conductedByPartyId'],
      where: { status: 'scheduled' },
      _count: { _all: true },
    });
    const byParty = new Map(
      load.map((row) => [row.conductedByPartyId, row._count._all]),
    );

    return accounts
      .map((account) => ({
        partyId: account.partyId,
        displayName: account.party.displayName,
        assignedCount: byParty.get(account.partyId) ?? 0,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  async getViewingOrThrow(viewingId: string): Promise<Viewing> {
    const viewing = await this.prisma.viewing.findUnique({
      where: { id: viewingId },
    });
    if (!viewing) {
      throw new ViewingNotFoundError(viewingId);
    }
    return viewing;
  }

  async getFieldReport(viewingId: string): Promise<FieldReport | null> {
    return this.prisma.fieldReport.findUnique({ where: { viewingId } });
  }

  async getIntroduction(viewingId: string): Promise<IntroductionRecord | null> {
    return this.prisma.introductionRecord.findUnique({ where: { viewingId } });
  }

  private async loadForUpdate(viewingId: string, tx: Tx): Promise<Viewing> {
    const viewing = await tx.viewing.findUnique({ where: { id: viewingId } });
    if (!viewing) {
      throw new ViewingNotFoundError(viewingId);
    }
    return viewing;
  }
}
