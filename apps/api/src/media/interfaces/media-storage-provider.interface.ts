/**
 * The boundary to whatever actually stores bytes (FR-5.5, NFR-5).
 *
 * ── Why an interface with a mock behind it ──
 * Same reasoning as PaymentProvider and IdentityProvider: object storage is
 * a procurement decision, not a design one. Nothing in the domain may name
 * S3, GCS, Cloudinary or a local disk. V1 ships MockMediaStorageProvider;
 * the real backend is a later implementation of this same interface and no
 * caller changes.
 *
 * ── Why the provider owns variant layout but NOT the policy ──
 * The provider is told which variants to produce and returns a handle for
 * each. WHICH variants exist, their byte ceilings, and which MIME types are
 * acceptable are policy — they live in MediaService, so swapping storage
 * cannot silently change what "compressed for low bandwidth" means.
 *
 * ── Product-agnostic ──
 * Deliberately expressed in kind/bytes/variant terms. There is no
 * "property", "listing" or "field report" here, because media capture is a
 * company-level capability and House For Rent is one consumer of it
 * (SSOT §5 rule 8).
 */

export const MEDIA_STORAGE_PROVIDER = Symbol('MEDIA_STORAGE_PROVIDER');

export type MediaKindName = 'image' | 'video';

/**
 * Rungs of the degradation ladder, smallest first. A client on a poor
 * connection asks for a byte budget and receives the richest rung that
 * fits — never a failure to load (NFR-5).
 */
export type MediaVariantName = 'thumb' | 'low' | 'standard';

export interface VariantSpec {
  name: MediaVariantName;
  /** Hard ceiling in bytes. A produced variant exceeding this is a defect. */
  maxBytes: number;
  /** Longest-edge pixels for images; nominal height for video. */
  maxEdgePx: number;
}

export interface StoreRequest {
  kind: MediaKindName;
  mimeType: string;
  /** Size of the source the officer's device is offering. */
  sourceByteSize: number;
  /** Opaque handle to the source bytes (a temp upload ref, not the bytes). */
  sourceRef: string;
  /** The ladder MediaService's policy requires for this kind. */
  variants: VariantSpec[];
}

export interface StoredVariant {
  name: MediaVariantName;
  /** Opaque per-variant handle the client fetches. */
  variantRef: string;
  byteSize: number;
}

export interface StoredMedia {
  /** The handle persisted as `media_asset.storage_ref`. */
  storageRef: string;
  variants: StoredVariant[];
}

export interface MediaStorageProvider {
  /**
   * Persists the source and produces every requested variant. Implementations
   * MUST honour each spec's `maxBytes`; returning an oversized variant is
   * what MediaService's post-condition check exists to catch.
   */
  store(request: StoreRequest): Promise<StoredMedia>;

  /** Every rung available for a stored asset, smallest first. */
  variantsFor(storageRef: string): Promise<StoredVariant[]>;
}
