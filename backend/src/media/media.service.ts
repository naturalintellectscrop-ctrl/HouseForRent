import { Inject, Injectable } from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MEDIA_STORAGE_PROVIDER } from './interfaces/media-storage-provider.interface';
import type {
  MediaKindName,
  MediaStorageProvider,
  StoredVariant,
  VariantSpec,
} from './interfaces/media-storage-provider.interface';

export class UnsupportedMediaTypeError extends Error {
  constructor(mimeType: string, kind: string) {
    super(
      `"${mimeType}" is not an accepted ${kind} type. The accepted set is ` +
        'deliberately narrow so the field app cannot upload formats the ' +
        'low-bandwidth ladder cannot transcode (FR-5.5, NFR-5).',
    );
    this.name = 'UnsupportedMediaTypeError';
  }
}

export class MediaTooLargeError extends Error {
  constructor(byteSize: number, ceiling: number) {
    super(
      `source of ${byteSize} bytes exceeds the ${ceiling}-byte capture ` +
        'ceiling. Rejecting at the boundary means a field officer on a slow ' +
        'connection fails fast instead of exhausting their bundle on an ' +
        'upload that will be refused anyway (NFR-5).',
    );
    this.name = 'MediaTooLargeError';
  }
}

export class CompressionPolicyViolationError extends Error {
  constructor(variant: string, byteSize: number, ceiling: number) {
    super(
      `storage returned a "${variant}" variant of ${byteSize} bytes against a ` +
        `${ceiling}-byte ceiling. The ladder is the low-bandwidth guarantee ` +
        '(NFR-5); a provider that cannot honour it must fail loudly rather ' +
        'than quietly serve unusable media to a field officer.',
    );
    this.name = 'CompressionPolicyViolationError';
  }
}

export class MediaAssetNotFoundError extends Error {
  constructor(mediaAssetId: string) {
    super(`media asset ${mediaAssetId} not found`);
    this.name = 'MediaAssetNotFoundError';
  }
}

/**
 * ── The compression policy lives HERE, not in the provider ──
 * These ceilings are the operational meaning of "degrades gracefully"
 * (FR-5.5 AC, NFR-5). Keeping them on this side of the interface means
 * changing the storage backend cannot silently change what a tenant on a
 * 2G connection receives.
 *
 * The ladder is deliberately shallow — three rungs, smallest first. A
 * client states a byte budget and gets the richest rung that fits.
 */
const LADDER: Record<MediaKindName, VariantSpec[]> = {
  image: [
    { name: 'thumb', maxBytes: 24_000, maxEdgePx: 320 },
    { name: 'low', maxBytes: 120_000, maxEdgePx: 720 },
    { name: 'standard', maxBytes: 600_000, maxEdgePx: 1600 },
  ],
  video: [
    { name: 'thumb', maxBytes: 40_000, maxEdgePx: 240 },
    { name: 'low', maxBytes: 2_000_000, maxEdgePx: 360 },
    { name: 'standard', maxBytes: 12_000_000, maxEdgePx: 720 },
  ],
};

const ACCEPTED_MIME: Record<MediaKindName, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
};

/** What a field device may offer before we refuse it outright. */
const SOURCE_CEILING_BYTES: Record<MediaKindName, number> = {
  image: 20_000_000,
  video: 200_000_000,
};

/**
 * Field media capture (FR-5.5).
 *
 * The service owns the policy and the post-conditions; the provider owns
 * the bytes. Note that this writes exactly the columns Data_Model.md §10.1
 * specifies and no others — the variant ladder is resolved through the
 * provider from `storage_ref`, so supporting it required no schema change.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MEDIA_STORAGE_PROVIDER)
    private readonly storage: MediaStorageProvider,
  ) {}

  /**
   * Accepts a field capture: validates it against policy, has the provider
   * produce every rung of the ladder, verifies the ceilings were honoured,
   * then records the asset.
   *
   * Validation happens BEFORE the provider is called, so a rejected capture
   * costs nothing and leaves no orphan bytes.
   */
  async capture(params: {
    capturedByPartyId: string;
    kind: MediaKindName;
    mimeType: string;
    sourceByteSize: number;
    sourceRef: string;
  }) {
    if (!ACCEPTED_MIME[params.kind].includes(params.mimeType)) {
      throw new UnsupportedMediaTypeError(params.mimeType, params.kind);
    }

    const ceiling = SOURCE_CEILING_BYTES[params.kind];
    if (params.sourceByteSize > ceiling) {
      throw new MediaTooLargeError(params.sourceByteSize, ceiling);
    }

    const specs = LADDER[params.kind];
    const stored = await this.storage.store({
      kind: params.kind,
      mimeType: params.mimeType,
      sourceByteSize: params.sourceByteSize,
      sourceRef: params.sourceRef,
      variants: specs,
    });

    // Post-condition: the ladder is a guarantee, so it is checked rather
    // than trusted. A provider that returns an oversized rung is a defect
    // we surface here, not one a tenant discovers on a slow connection.
    for (const spec of specs) {
      const produced = stored.variants.find((v) => v.name === spec.name);
      if (!produced || produced.byteSize > spec.maxBytes) {
        throw new CompressionPolicyViolationError(
          spec.name,
          produced?.byteSize ?? -1,
          spec.maxBytes,
        );
      }
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageRef: stored.storageRef,
        kind: params.kind as MediaKind,
        uploadedByPartyId: params.capturedByPartyId,
      },
    });

    return { asset, variants: stored.variants };
  }

  /**
   * The richest rung fitting `maxBytes` — graceful degradation as a
   * server-side contract rather than client-side hope (NFR-5).
   *
   * Returns the smallest rung when nothing fits, because showing a tenant
   * a thumbnail beats showing them a broken image. Only a genuinely
   * empty asset yields null.
   */
  async forBandwidth(
    mediaAssetId: string,
    maxBytes: number,
  ): Promise<StoredVariant | null> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
    });
    if (!asset) {
      throw new MediaAssetNotFoundError(mediaAssetId);
    }

    const variants = await this.storage.variantsFor(asset.storageRef);
    if (variants.length === 0) {
      return null;
    }

    const ascending = [...variants].sort((a, b) => a.byteSize - b.byteSize);
    const fitting = ascending.filter((v) => v.byteSize <= maxBytes);
    return fitting.length > 0 ? fitting[fitting.length - 1] : ascending[0];
  }

  /** The policy itself, exposed so a client can size its requests. */
  ladderFor(kind: MediaKindName): readonly VariantSpec[] {
    return LADDER[kind];
  }
}
