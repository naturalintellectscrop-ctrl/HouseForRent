import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '../config/config.service';

export class NeighbourhoodNotFoundError extends Error {
  constructor(id: string) {
    super(`neighbourhood ${id} not found`);
    this.name = 'NeighbourhoodNotFoundError';
  }
}

export class DuplicateNeighbourhoodError extends Error {
  constructor(name: string, parentId: string | null) {
    super(
      `a neighbourhood named "${name}" already exists under ${
        parentId ? `parent ${parentId}` : 'the root'
      }. The taxonomy is the primary location field (FR-2.2), so two ` +
        'entries with the same name under the same parent would make a ' +
        "landlord's picker ambiguous and split the search index in two.",
    );
    this.name = 'DuplicateNeighbourhoodError';
  }
}

/** One taxonomy node, with the count of listings a tenant could actually see. */
export interface NeighbourhoodNode {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  inServiceArea: boolean;
  /**
   * How many homes a tenant would actually see if they filtered by this
   * area — the SAME predicate `SearchService.search()` applies, freshness
   * included. A count that says 3 where the search returns 2 is a small
   * dishonesty on a page whose entire job is being believed.
   */
  liveListingCount: number;
}

/**
 * The location taxonomy (F-015).
 *
 * ── Why this is public ──
 * `GET /v1/listings` accepts a `neighbourhoodId` filter and
 * `POST /v1/properties` requires one. Before this module existed, a client
 * was expected to know ids it had no route to discover, so every seed and
 * test reached past the API with `prisma.neighbourhood.create`. The
 * taxonomy IS the search vocabulary (FR-2.2) — a tenant browsing
 * anonymously needs it as much as a landlord authoring a property does.
 *
 * ── Why creation is admin-only ──
 * `inServiceArea` decides what the public feed contains (FR-2.5). A lister
 * who could mint their own neighbourhood and flag it in-service would have
 * routed around corridor scoping entirely.
 */
@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * The taxonomy as a tenant or landlord sees it.
   *
   * Defaults to the service area only, because that is what both callers
   * actually need: a neighbourhood outside the corridor can never carry a
   * live listing (FR-2.5), so offering it in a picker sets a landlord up to
   * publish into a void. Admin surfaces pass `includeOutOfArea`.
   */
  async neighbourhoods(opts: {
    includeOutOfArea?: boolean;
    /** Case-insensitive name fragment, for a type-ahead picker. */
    q?: string;
  } = {}): Promise<NeighbourhoodNode[]> {
    const now = new Date();
    const windowDays = await this.config.freshnessWindowDays(now);
    const staleCutoff = new Date(
      now.getTime() - windowDays * 24 * 60 * 60 * 1000,
    );

    const rows = await this.prisma.neighbourhood.findMany({
      where: {
        ...(opts.includeOutOfArea ? {} : { inServiceArea: true }),
        ...(opts.q ? { name: { contains: opts.q, mode: 'insensitive' } } : {}),
      },
      include: {
        parent: { select: { name: true } },
        _count: {
          select: {
            properties: {
              where: {
                listings: {
                  some: {
                    publicationState: 'live',
                    verificationState: 'verified',
                    availabilityStatus: 'available',
                    // Freshness, mirroring the search default. Without it a
                    // chip would advertise homes the feed behind it excludes.
                    availabilityConfirmedAt: { gte: staleCutoff },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [{ name: 'asc' }],
    });

    return rows.map((n) => ({
      id: n.id,
      name: n.name,
      parentId: n.parentId,
      parentName: n.parent?.name ?? null,
      inServiceArea: n.inServiceArea,
      liveListingCount: n._count.properties,
    }));
  }

  async create(params: {
    name: string;
    parentId?: string;
    inServiceArea: boolean;
    actorPartyId: string;
  }): Promise<NeighbourhoodNode> {
    const name = params.name.trim();
    const parentId = params.parentId ?? null;

    if (parentId) {
      const parent = await this.prisma.neighbourhood.findUnique({
        where: { id: parentId },
      });
      if (!parent) throw new NeighbourhoodNotFoundError(parentId);
    }

    const clash = await this.prisma.neighbourhood.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, parentId },
    });
    if (clash) throw new DuplicateNeighbourhoodError(name, parentId);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.neighbourhood.create({
        data: { name, parentId, inServiceArea: params.inServiceArea },
      });
      // Corridor membership decides what the public feed contains, so a
      // change to it is a business event and not a data edit (NFR-2).
      await this.audit.record(
        {
          eventType: 'neighbourhood_created',
          actorPartyId: params.actorPartyId,
          subjectRef: row.id,
          payload: { name: row.name, inServiceArea: row.inServiceArea },
        },
        tx,
      );
      return row;
    });

    return {
      id: created.id,
      name: created.name,
      parentId: created.parentId,
      parentName: null,
      inServiceArea: created.inServiceArea,
      liveListingCount: 0,
    };
  }

  /** Corridor membership, changed deliberately and recorded (FR-2.5). */
  async setServiceArea(params: {
    id: string;
    inServiceArea: boolean;
    actorPartyId: string;
  }) {
    const existing = await this.prisma.neighbourhood.findUnique({
      where: { id: params.id },
    });
    if (!existing) throw new NeighbourhoodNotFoundError(params.id);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.neighbourhood.update({
        where: { id: params.id },
        data: { inServiceArea: params.inServiceArea },
      });
      await this.audit.record(
        {
          eventType: 'neighbourhood_service_area_changed',
          actorPartyId: params.actorPartyId,
          subjectRef: row.id,
          payload: {
            from: existing.inServiceArea,
            to: row.inServiceArea,
          },
        },
        tx,
      );
      return row;
    });
  }

  /**
   * The amenity vocabulary. Public: `GET /v1/listings` accepts an
   * `amenityId` filter, so the same discoverability argument applies.
   */
  async amenities() {
    return this.prisma.amenity.findMany({ orderBy: { name: 'asc' } });
  }
}
