'use client';

import { useState } from 'react';
import { PropertyMedia } from '@/app/ui';
import type { ListingPhoto } from '@/lib/contract';

/**
 * The property photo gallery.
 *
 * ── Why it is a client component at all ──
 * Swapping the selected photograph is presentation state, not business
 * state, so this is the one place on the detail page where browser state is
 * allowed. Everything around it — price, terms, verification — stays
 * server-rendered.
 *
 * ── Accessibility ──
 * Thumbnails are real <button>s (focusable, Enter/Space native), the
 * selected one carries aria-current, and the film strip is labelled. The
 * alt text of the large image follows the selection.
 */
export function PhotoGallery({
  photos,
  altBase,
}: {
  photos: ListingPhoto[];
  /** Plain data, not a function: functions cannot cross the
      server→client boundary. The alt is composed here. */
  altBase: string;
}) {
  const [selected, setSelected] = useState(0);
  const current = photos[selected] ?? photos[0];

  return (
    <div>
      <div className="gallery-main">
        {current ? (
          <PropertyMedia photo={current} alt={current.caption ?? altBase} priority />
        ) : (
          <PropertyMedia alt="" />
        )}
      </div>

      {photos.length > 1 ? (
        <div className="gallery-thumbs" role="group" aria-label="Photographs of this property">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              className={`gallery-thumb${i === selected ? ' is-current' : ''}`}
              aria-current={i === selected}
              aria-label={`Photo ${i + 1} of ${photos.length}`}
              onClick={() => setSelected(i)}
            >
              { }
              <img src={photo.url} alt="" loading="lazy" decoding="async" />
              {photo.isDevelopmentFixture ? (
                <span className="gallery-thumb-flag">demo</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
