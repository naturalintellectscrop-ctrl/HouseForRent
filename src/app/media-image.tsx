'use client';

/**
 * The one <img> the product renders listing photography through, plus its
 * honest failure state.
 *
 * ── Why this exists (round-56) ──
 * MediaAsset rows can outlive their bytes: the round-56 media loss wrote
 * rows while production still ran on an ephemeral store, and the store now
 * answers 404 MEDIA_GONE for them. A plain <img> renders the browser's
 * broken-image glyph - visual noise that reads as a bug in the product.
 *
 * This frame swaps to the SAME empty-state register every genuinely
 * photo-less slot uses, labelled "Photograph unavailable": the page never
 * invents a replacement photograph (fabricating imagery is forbidden), and
 * it never looks broken while the owner decides on re-uploads.
 */
import { useState } from 'react';
import { Icon } from '@/app/ui';

export function MediaImage({
  src,
  alt,
  eager = false,
  fetchHighPriority = false,
  sizes,
}: {
  src: string;
  alt: string;
  /** Above-the-fold images (gallery main, hero cards) load eagerly. */
  eager?: boolean;
  fetchHighPriority?: boolean;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="media-missing" role="img" aria-label={`${alt} (photograph unavailable)`}>
        <Icon.camera size={20} />
        <span>Photograph unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={fetchHighPriority ? 'high' : 'auto'}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}
