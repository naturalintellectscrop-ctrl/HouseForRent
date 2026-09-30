'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PropertyMedia } from '@/app/ui';
import type { ListingPhoto } from '@/lib/contract';

/**
 * The property photo gallery.
 *
 * ── Why it is a client component at all ──
 * Swapping the selected photograph is presentation state, not business
 * state, so this is the one place on the detail page where browser state is
 * allowed. Everything around it - price, terms, verification - stays
 * server-rendered.
 *
 * ── Accessibility ──
 * Thumbnails are real <button>s (focusable, Enter/Space native), the
 * selected one carries aria-current, and the film strip is labelled.
 * Arrow keys move between photographs while a thumbnail has focus, which
 * is the pattern screen-reader users expect from an image group, and an
 * aria-live line announces "Photo X of Y" so the change is spoken without
 * re-reading the whole image. The alt text of the large image follows the
 * selection.
 *
 * ── The adjacent preload ──
 * The next photograph is fetched quietly while the current one is being
 * looked at. It is presentation only - a slower connection simply skips
 * it - and it never touches the business boundary.
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
  const thumbRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = useCallback(
    (delta: number) => {
      setSelected((s) => {
        const next = Math.min(photos.length - 1, Math.max(0, s + delta));
        return next;
      });
    },
    [photos.length],
  );

  function onThumbKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (index < photos.length - 1) {
        setSelected(index + 1);
        thumbRefs.current[index + 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (index > 0) {
        setSelected(index - 1);
        thumbRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelected(0);
      thumbRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelected(photos.length - 1);
      thumbRefs.current[photos.length - 1]?.focus();
    }
  }

  useEffect(() => {
    const next = photos[selected + 1];
    if (!next) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = next.url;
    link.dataset.galleryPreload = 'true';
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, [photos, selected]);

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
        <>
          {/* Spoken when the selection changes; visually hidden. */}
          <p className="sr-only" aria-live="polite">
            Photo {selected + 1} of {photos.length}
          </p>
          <div className="gallery-thumbs" role="group" aria-label="Photographs of this property">
            {photos.map((photo, i) => (
              <button
                key={photo.id}
                type="button"
                ref={(el) => {
                  thumbRefs.current[i] = el;
                }}
                className={`gallery-thumb${i === selected ? ' is-current' : ''}`}
                aria-current={i === selected}
                aria-label={`Photo ${i + 1} of ${photos.length}`}
                onKeyDown={(e) => onThumbKeyDown(e, i)}
                onClick={() => setSelected(i)}
              >
                <img src={photo.url} alt="" loading="lazy" decoding="async" />
                {photo.isDevelopmentFixture ? (
                  <span className="gallery-thumb-flag">demo</span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
