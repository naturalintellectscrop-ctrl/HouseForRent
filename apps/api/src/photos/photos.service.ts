import { Injectable } from '@nestjs/common';
import { PhotoSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PhotoStore } from './photo-store';

export class PhotoTooLargeError extends Error {
  constructor(byteSize: number) {
    super(
      `image of ${byteSize} bytes exceeds the ${PhotoStore.MAX_BYTES}-byte ` +
        'ceiling. Downscale before uploading — a tenant on a metered ' +
        'connection should not pay for a raw camera export (NFR-5).',
    );
    this.name = 'PhotoTooLargeError';
  }
}

export class UnsupportedPhotoTypeError extends Error {
  constructor(mimeType: string) {
    super(
      `"${mimeType}" is not an accepted image type. Accepted: ` +
        PhotoStore.ACCEPTED.join(', '),
    );
    this.name = 'UnsupportedPhotoTypeError';
  }
}

export class PhotoNotFoundError extends Error {
  constructor(id: string) {
    super(`photo ${id} not found`);
    this.name = 'PhotoNotFoundError';
  }
}

/** A photo as any surface sees it. `source` travels with it, always. */
export interface ListingPhotoView {
  id: string;
  mediaAssetId: string;
  /** Relative to the API base. The API serves its own bytes. */
  url: string;
  caption: string | null;
  sortOrder: number;
  source: PhotoSource;
  /**
   * Server-asserted, so a client cannot decide to describe a lister's
   * snapshot as verified photography (FR-4.2).
   */
  isFieldVerified: boolean;
  /** True for seeded demonstration imagery. Surfaces MUST label it. */
  isDevelopmentFixture: boolean;
}

@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: PhotoStore,
    private readonly audit: AuditService,
  ) {}

  static view(row: {
    id: string;
    mediaAssetId: string;
    caption: string | null;
    sortOrder: number;
    source: PhotoSource;
  }): ListingPhotoView {
    return {
      id: row.id,
      mediaAssetId: row.mediaAssetId,
      url: `/v1/media/${row.mediaAssetId}`,
      caption: row.caption,
      sortOrder: row.sortOrder,
      source: row.source,
      isFieldVerified: row.source === 'field_officer',
      isDevelopmentFixture: row.source === 'development_fixture',
    };
  }

  /**
   * Photos for many listings at once, so a search result page is one query
   * rather than one per card.
   */
  async forListings(
    listingIds: string[],
  ): Promise<Map<string, ListingPhotoView[]>> {
    const byListing = new Map<string, ListingPhotoView[]>();
    if (listingIds.length === 0) return byListing;

    const rows = await this.prisma.listingPhoto.findMany({
      where: { listingId: { in: listingIds } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    for (const row of rows) {
      const list = byListing.get(row.listingId) ?? [];
      list.push(PhotosService.view(row));
      byListing.set(row.listingId, list);
    }
    return byListing;
  }

  async forListing(listingId: string): Promise<ListingPhotoView[]> {
    return (await this.forListings([listingId])).get(listingId) ?? [];
  }

  /**
   * Accepts an uploaded photograph.
   *
   * `source` is decided by the CALLER'S ROLE, never by the request body: a
   * lister uploading their own snapshot cannot label it field-verified,
   * because "our officer stood in that room" is the one claim this platform
   * sells and the one a lister has every incentive to make falsely.
   */
  async attach(params: {
    listingId: string;
    uploadedByPartyId: string;
    role: 'lister' | 'foo' | 'admin';
    mimeType: string;
    bytes: Buffer;
    caption?: string;
  }): Promise<ListingPhotoView> {
    if (!PhotoStore.ACCEPTED.includes(params.mimeType as never)) {
      throw new UnsupportedPhotoTypeError(params.mimeType);
    }
    if (params.bytes.byteLength > PhotoStore.MAX_BYTES) {
      throw new PhotoTooLargeError(params.bytes.byteLength);
    }

    const source: PhotoSource =
      params.role === 'foo' ? 'field_officer' : 'lister';

    const stored = await this.store.put({
      bytes: params.bytes,
      mimeType: params.mimeType,
    });

    const highest = await this.prisma.listingPhoto.findFirst({
      where: { listingId: params.listingId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageRef: stored.storageRef,
          kind: 'image',
          uploadedByPartyId: params.uploadedByPartyId,
          mimeType: params.mimeType,
          byteSize: stored.byteSize,
        },
      });

      const photo = await tx.listingPhoto.create({
        data: {
          listingId: params.listingId,
          mediaAssetId: asset.id,
          sortOrder: (highest?.sortOrder ?? -1) + 1,
          caption: params.caption,
          source,
        },
      });

      await this.audit.record(
        {
          eventType: 'listing_photo_added',
          actorPartyId: params.uploadedByPartyId,
          subjectRef: params.listingId,
          payload: { photoId: photo.id, source, byteSize: stored.byteSize },
        },
        tx,
      );

      return photo;
    });

    return PhotosService.view(row);
  }

  /**
   * Seeds a demonstration photograph. Separate from `attach` so the fixture
   * provenance cannot be reached from any HTTP route — a seeded image must
   * never be creatable by a caller.
   */
  async seedFixture(params: {
    listingId: string;
    uploadedByPartyId: string;
    mimeType: string;
    bytes: Buffer;
    caption?: string;
    sortOrder: number;
  }) {
    const stored = await this.store.put({
      bytes: params.bytes,
      mimeType: params.mimeType,
    });

    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageRef: stored.storageRef,
        kind: 'image',
        uploadedByPartyId: params.uploadedByPartyId,
        mimeType: params.mimeType,
        byteSize: stored.byteSize,
      },
    });

    return this.prisma.listingPhoto.create({
      data: {
        listingId: params.listingId,
        mediaAssetId: asset.id,
        sortOrder: params.sortOrder,
        caption: params.caption,
        source: 'development_fixture',
      },
    });
  }

  async remove(params: { photoId: string; actorPartyId: string }) {
    const photo = await this.prisma.listingPhoto.findUnique({
      where: { id: params.photoId },
    });
    if (!photo) throw new PhotoNotFoundError(params.photoId);

    await this.prisma.$transaction(async (tx) => {
      await tx.listingPhoto.delete({ where: { id: params.photoId } });
      await this.audit.record(
        {
          eventType: 'listing_photo_removed',
          actorPartyId: params.actorPartyId,
          subjectRef: photo.listingId,
          payload: { photoId: photo.id, source: photo.source },
        },
        tx,
      );
    });
    // The media asset itself is left in place: it is referenced by an audit
    // trail, and deleting bytes an audit row points at defeats the trail.
  }

  /** Bytes for a media asset, with the type to serve them as. */
  async bytesFor(
    mediaAssetId: string,
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
    });
    if (!asset) return null;

    const bytes = await this.store.get(asset.storageRef);
    if (!bytes) return null;

    return { bytes, mimeType: asset.mimeType ?? 'application/octet-stream' };
  }
}
