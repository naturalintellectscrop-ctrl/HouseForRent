import { Injectable } from '@nestjs/common';
import { ListingAgreement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { computeCommission } from '../deals/commission';
import {
  clauseText,
  CURRENT_CLAUSE_VERSION,
  type ClauseText,
} from './circumvention-clause';

export class NoCommissionRateInForceError extends Error {
  constructor() {
    super(
      'no commission_rate_version is in force, so no agreement can be ' +
        'presented. The rate a landlord is asked to accept must be a real, ' +
        'versioned rate — inventing a default here is how an unvalidated ' +
        'business parameter becomes permanent (PRD §1.5, FR-10.1).',
    );
    this.name = 'NoCommissionRateInForceError';
  }
}

export class AgreementAlreadyAcceptedError extends Error {
  constructor(listingId: string) {
    super(
      `listing ${listingId} already has an accepted agreement. The agreement ` +
        'is immutable and originates the rate snapshot; re-accepting would ' +
        'either duplicate that origin or silently re-price (FR-7.4, FR-9.1).',
    );
    this.name = 'AgreementAlreadyAcceptedError';
  }
}

export class NotTheListerError extends Error {
  constructor(listingId: string) {
    super(
      `only the lister who owns listing ${listingId} may accept its ` +
        'agreement — it is a contract naming them as the payer (FR-9.2).',
    );
    this.name = 'NotTheListerError';
  }
}

/** What a lister is shown BEFORE accepting (FR-9.1). */
export interface PresentedTerms {
  listingId: string;
  monthlyRent: bigint;
  commissionRateBp: number;
  /** What this let would actually cost, at today's rent and rate. */
  commissionIfLet: bigint;
  clause: ClauseText;
  /** Structural, server-asserted, never client copy (FR-9.2, Decision 3). */
  payer: 'landlord';
  tenantPays: false;
  alreadyAccepted: boolean;
}

/**
 * Listing agreements (Data_Model.md §9.1, FR-9.1, FR-9.2).
 *
 * This is where the rate snapshot ORIGINATES. `presentTerms` shows the
 * landlord the rate and the resulting figure in shillings — not a
 * percentage they must do arithmetic on — and `accept` freezes exactly the
 * rate version that was shown.
 *
 * ── Why the shown figure and the frozen figure cannot diverge ──
 * `accept()` re-reads the rate in force and refuses if it differs from the
 * one the lister was shown (`expectedRateVersionId`). Without that, a rate
 * change landing between presentation and acceptance would bind a landlord
 * to terms they never saw. The check is optional only for callers that did
 * not present terms first; the HTTP endpoint always supplies it.
 */
@Injectable()
export class AgreementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The rate version in force now (Data_Model.md §3.2). */
  async rateInForce(asOf?: Date) {
    const at = asOf ?? new Date();
    const version = await this.prisma.commissionRateVersion.findFirst({
      where: { effectiveFrom: { lte: at } },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!version) {
      throw new NoCommissionRateInForceError();
    }
    return version;
  }

  /**
   * FR-9.1 — the terms, in plain language, with the money spelled out.
   *
   * Read-only: presenting terms creates nothing, so a landlord can look
   * without being bound.
   */
  async presentTerms(listingId: string, asOf?: Date): Promise<PresentedTerms> {
    const listing = await this.prisma.listing.findUniqueOrThrow({
      where: { id: listingId },
      include: { listingAgreements: { where: { accepted: true }, take: 1 } },
    });
    const rate = await this.rateInForce(asOf);
    const clause = clauseText(CURRENT_CLAUSE_VERSION);

    return {
      listingId,
      monthlyRent: listing.monthlyRent,
      commissionRateBp: rate.rateBpOfMonth,
      // The same pure function the deal will use at commission_earned, so
      // the figure quoted here and the figure charged later come from one
      // implementation rather than two that can drift.
      commissionIfLet: computeCommission({
        monthlyRentSnapshot: listing.monthlyRent,
        commissionRateBpSnapshot: rate.rateBpOfMonth,
      }),
      clause,
      payer: 'landlord',
      tenantPays: false,
      alreadyAccepted: listing.listingAgreements.length > 0,
    };
  }

  /**
   * FR-9.1 — records acceptance, immutably.
   *
   * Writes `accepted: true` and `acceptedAt` in the SAME insert rather than
   * creating-then-updating: `listing_agreement` is 🔒, so an update would be
   * rejected by the database. An unaccepted agreement row is therefore never
   * written at all — the row's existence IS the acceptance.
   */
  async accept(params: {
    listingId: string;
    listerPartyId: string;
    /** The rate version the lister was shown; guards against a mid-flight change. */
    expectedRateVersionId?: string;
    clauseVersion?: string;
    acceptedAt?: Date;
  }): Promise<ListingAgreement> {
    const listing = await this.prisma.listing.findUniqueOrThrow({
      where: { id: params.listingId },
      include: {
        property: true,
        listingAgreements: { where: { accepted: true }, take: 1 },
      },
    });

    if (listing.property.ownerPartyId !== params.listerPartyId) {
      throw new NotTheListerError(params.listingId);
    }
    if (listing.listingAgreements.length > 0) {
      throw new AgreementAlreadyAcceptedError(params.listingId);
    }

    const rate = await this.rateInForce();
    if (
      params.expectedRateVersionId &&
      params.expectedRateVersionId !== rate.id
    ) {
      throw new NoCommissionRateInForceError();
    }

    // Validates the version exists before anything is written — an
    // agreement referencing text that is not on record proves nothing.
    const clause = clauseText(params.clauseVersion ?? CURRENT_CLAUSE_VERSION);
    const acceptedAt = params.acceptedAt ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const agreement = await tx.listingAgreement.create({
        data: {
          listingId: params.listingId,
          listerPartyId: params.listerPartyId,
          commissionRateVersionId: rate.id,
          monthlyRentAtSigning: listing.monthlyRent,
          circumventionClauseVersion: clause.version,
          accepted: true,
          acceptedAt,
        },
      });

      await this.audit.record(
        {
          eventType: 'listing_agreement_accepted',
          actorPartyId: params.listerPartyId,
          subjectRef: agreement.id,
          payload: {
            listingId: params.listingId,
            commissionRateVersionId: rate.id,
            commissionRateBp: rate.rateBpOfMonth,
            monthlyRentAtSigning: listing.monthlyRent.toString(),
            circumventionClauseVersion: clause.version,
            payer: 'landlord',
          },
          occurredAt: acceptedAt,
        },
        tx,
      );

      return agreement;
    });
  }

  /** The accepted agreement for a listing, if any. */
  async acceptedFor(listingId: string): Promise<ListingAgreement | null> {
    return this.prisma.listingAgreement.findFirst({
      where: { listingId, accepted: true },
    });
  }
}
