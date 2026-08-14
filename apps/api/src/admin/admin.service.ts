import { Injectable } from '@nestjs/common';
import { ConfigValueType, DealStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import { PaymentsService } from '../payments/payments.service';
import { LedgerService } from '../ledger/ledger.service';
import { AuditService } from '../audit/audit.service';

export class UnknownConfigKeyError extends Error {
  constructor(key: string) {
    super(
      `"${key}" is not a configuration parameter. The V1 set is fixed ` +
        `(${Object.keys(CONFIG_VALUE_TYPES).join(', ')}) — accepting an ` +
        'arbitrary key would let a typo create a parameter nothing ever ' +
        'reads, so the change would appear to succeed while having no ' +
        'effect (FR-10.1).',
    );
    this.name = 'UnknownConfigKeyError';
  }
}

/**
 * The V1 configuration parameters and their storage types (PRD §1.5,
 * Data_Model.md §3.1). Money-touching config is deliberately absent — the
 * commission rate has its own versioned table and is consumed by snapshot,
 * never by live lookup.
 */
const CONFIG_VALUE_TYPES: Record<string, ConfigValueType> = {
  [CONFIG_KEYS.serviceArea]: 'json',
  [CONFIG_KEYS.freshnessWindowDays]: 'int',
  [CONFIG_KEYS.screeningModules]: 'json',
  [CONFIG_KEYS.launchGateCount]: 'int',
  [CONFIG_KEYS.requiredMonthsDefault]: 'int',
};

/**
 * Admin observability (PRD E10).
 *
 * Everything here is READ-ONLY except the two version-creating operations
 * (FR-10.1), which create new immutable versions and never mutate an
 * existing one. There is deliberately no admin operation that edits a
 * ledger entry, a rate version, or a deal's status directly — an admin
 * console powerful enough to rewrite the books is a console that can
 * destroy the audit trail it exists to display.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * FR-10.3 — live verified inventory against the configured launch gate.
   *
   * The count applies the SAME three constraints the public feed does
   * (live + verified + in-corridor) plus freshness, because a gate counting
   * listings a tenant could not find would measure nothing. Freshness is
   * computed against the config window rather than stored, exactly as
   * Stage 5 does — so widening the window changes this number with no
   * backfill.
   */
  async launchGate(asOf?: Date) {
    const now = asOf ?? new Date();
    const gate = await this.config.getValue<number>(
      CONFIG_KEYS.launchGateCount,
      now,
    );
    const windowDays = await this.config.freshnessWindowDays(now);
    const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const qualifyingWhere = {
      publicationState: 'live' as const,
      verificationState: 'verified' as const,
      availabilityStatus: 'available' as const,
      property: { neighbourhood: { inServiceArea: true } },
    };

    const [qualifying, stale] = await Promise.all([
      this.prisma.listing.count({
        where: {
          ...qualifyingWhere,
          availabilityConfirmedAt: { gte: cutoff },
        },
      }),
      // Counted separately rather than silently excluded: "we have 40
      // listings but 18 are stale" is a different operational problem from
      // "we have 22 listings", and an admin needs to see which one they have.
      this.prisma.listing.count({
        where: {
          ...qualifyingWhere,
          OR: [
            { availabilityConfirmedAt: null },
            { availabilityConfirmedAt: { lt: cutoff } },
          ],
        },
      }),
    ]);

    return {
      gate,
      qualifying,
      staleExcluded: stale,
      freshnessWindowDays: windowDays,
      gateMet: qualifying >= gate,
      shortfall: Math.max(0, gate - qualifying),
      asOf: now,
    };
  }

  /**
   * FR-10.2 — the verification queue, with mandate state.
   *
   * Returns what blocks each listing rather than a bare list, because the
   * queue's purpose is dispatch: an ops officer needs to know whether a
   * property is waiting on a field visit, a mandate decision, or an
   * agreement.
   */
  async verificationQueue() {
    const listings = await this.prisma.listing.findMany({
      where: {
        publicationState: { in: ['draft', 'awaiting_verification'] },
      },
      include: {
        property: {
          include: {
            neighbourhood: true,
            ownerParty: { include: { listerProfile: true } },
          },
        },
        listingAgreements: { where: { accepted: true }, take: 1 },
      },
      orderBy: { createdAt: 'asc' },
    });

    const rows = await Promise.all(
      listings.map(async (listing) => {
        const tier = listing.property.ownerParty.listerProfile?.tier ?? null;
        const mandate =
          tier && tier !== 'property_owner'
            ? await this.prisma.propertyMandate.findFirst({
                where: {
                  listerPartyId: listing.property.ownerPartyId,
                  propertyId: listing.propertyId,
                },
                orderBy: { createdAt: 'desc' },
              })
            : null;

        const blockedBy: string[] = [];
        if (listing.verificationState !== 'verified') {
          blockedBy.push('field_verification');
        }
        if (!listing.property.neighbourhood.inServiceArea) {
          blockedBy.push('outside_service_area');
        }
        if (tier && tier !== 'property_owner' && mandate?.state !== 'verified') {
          blockedBy.push('mandate');
        }
        if (listing.listingAgreements.length === 0) {
          blockedBy.push('listing_agreement');
        }

        return {
          listingId: listing.id,
          propertyId: listing.propertyId,
          listerPartyId: listing.property.ownerPartyId,
          listerTier: tier,
          neighbourhood: listing.property.neighbourhood.name,
          inServiceArea: listing.property.neighbourhood.inServiceArea,
          verificationState: listing.verificationState,
          mandateState: mandate?.state ?? null,
          hasAcceptedAgreement: listing.listingAgreements.length > 0,
          blockedBy,
          createdAt: listing.createdAt,
        };
      }),
    );

    return { total: rows.length, rows };
  }

  /**
   * FR-10.4 — ledger ↔ PSP reconciliation.
   *
   * Runs a fresh check and returns it alongside recent history, because a
   * single green reading says less than a pattern. `everyPostingBalances()`
   * is included as an independent internal-integrity signal: the ledger can
   * disagree with the custodian (a real, actionable divergence) or disagree
   * with ITSELF (a defect), and those need different responses.
   */
  async reconciliation(limit = 10) {
    const check = await this.payments.runReconciliation();
    const [history, internallyConsistent] = await Promise.all([
      this.prisma.reconciliationCheck.findMany({
        orderBy: { runAt: 'desc' },
        take: limit,
      }),
      this.ledger.everyPostingBalances(),
    ]);

    return {
      latest: check,
      internallyConsistent,
      history,
    };
  }

  /** FR-10.4 — deal-state distribution. */
  async dealStates(status?: DealStatus) {
    const grouped = await this.prisma.deal.groupBy({
      by: ['status'],
      _count: { _all: true },
      ...(status ? { where: { status } } : {}),
    });

    const distribution = Object.fromEntries(
      grouped.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;

    return {
      distribution,
      total: grouped.reduce((sum, row) => sum + row._count._all, 0),
    };
  }

  /**
   * FR-10.1 — a config change is a NEW version, with an audit row.
   *
   * The key must be one of the V1 parameters. An arbitrary key would let a
   * typo create a parameter nothing ever reads — the change would appear to
   * succeed while having no effect, which is worse than a rejection.
   *
   * The parameter row is defined on demand (idempotent) so a fresh
   * environment does not require a separate seeding step before an admin can
   * set a value.
   */
  async setConfigValue(params: {
    key: string;
    value: unknown;
    actorPartyId: string;
    effectiveFrom?: Date;
  }) {
    const valueType = CONFIG_VALUE_TYPES[params.key];
    if (!valueType) {
      throw new UnknownConfigKeyError(params.key);
    }
    await this.config.defineParameter(params.key, valueType);

    const version = await this.config.setValue({
      key: params.key,
      value: params.value,
      createdByPartyId: params.actorPartyId,
      effectiveFrom: params.effectiveFrom,
    });

    await this.audit.record({
      eventType: 'config_version_created',
      actorPartyId: params.actorPartyId,
      subjectRef: params.key,
      payload: {
        configVersionId: version.id,
        value: version.value as never,
        effectiveFrom: version.effectiveFrom.toISOString(),
      },
      occurredAt: version.createdAt,
    });

    return version;
  }

  /**
   * FR-10.1 / FR-7.4 — a rate change is a NEW version.
   *
   * In-flight deals hold snapshots and are structurally unaffected; there
   * is no code path that edits an existing version, and the table is 🔒
   * immutable besides.
   */
  async createCommissionRateVersion(params: {
    rateBpOfMonth: number;
    actorPartyId: string;
    effectiveFrom?: Date;
    note?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const version = await tx.commissionRateVersion.create({
        data: {
          rateBpOfMonth: params.rateBpOfMonth,
          effectiveFrom: params.effectiveFrom ?? new Date(),
          createdByPartyId: params.actorPartyId,
          note: params.note,
        },
      });

      await this.audit.record(
        {
          eventType: 'commission_rate_version_created',
          actorPartyId: params.actorPartyId,
          subjectRef: version.id,
          payload: {
            rateBpOfMonth: version.rateBpOfMonth,
            effectiveFrom: version.effectiveFrom.toISOString(),
          },
          occurredAt: version.createdAt,
        },
        tx,
      );

      return version;
    });
  }

  /** FR-10.1 — the version history for a config key. */
  async configHistory(key: string) {
    if (!CONFIG_VALUE_TYPES[key]) {
      throw new UnknownConfigKeyError(key);
    }
    // A known key with no versions yet is an empty history, not an error —
    // that is the normal state of a parameter nobody has set.
    const parameter = await this.prisma.configParameter.findUnique({
      where: { key },
    });
    return parameter ? this.config.history(key) : [];
  }

  /** NFR-2 — the audit trail for one subject. */
  async auditTrail(subjectRef: string) {
    return this.audit.forSubject(subjectRef);
  }
}
