'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getJson, postFile, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

interface PhotoRow {
  id: string;
  mediaAssetId: string;
  url: string;
  caption: string | null;
  source: string;
  isFieldVerified: boolean;
  isDevelopmentFixture: boolean;
}

const MAX_BYTES = 4_000_000;
const ACCEPTED = 'image/jpeg,image/png';

const SOURCE_LABEL: Record<string, string> = {
  field_officer: 'verified — taken on our visit',
  lister: 'supplied by the lister',
  development_fixture: 'demonstration imagery',
};

/**
 * FR-5.5 - professional media captured during the field visit.
 *
 * This is the real ingest now: the officer's photographs ride the
 * MediaStorageProvider seam (Supabase Storage in production, disk in the
 * sandbox), land on the listing as `field_officer` provenance, and are
 * served only through the authorized media proxy. The client stays thin on
 * purpose - presence and size checks here just avoid a pointless round
 * trip on a field connection; the backend re-validates content (magic
 * bytes), ownership and the open-visit window regardless.
 *
 * Uploads are transactional server-side: a failed upload leaves no row and
 * no bytes, so it can never leave a published listing pointing at nothing.
 */
export function MediaCapture({ viewingId, listingId }: { viewingId: string; listingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadPhotos = useCallback(async () => {
    try {
      const data = await getJson<{ photos: PhotoRow[] }>(`/landlord/listings/${listingId}/photos`);
      setPhotos(data.photos);
      setLoaded(true);
    } catch {
      // Non-fatal: the strip is a convenience; the upload path validates
      // server-side regardless.
      setLoaded(true);
    }
  }, [listingId]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError({ message: 'Choose a photograph first.' });
      return;
    }
    if (file.size > MAX_BYTES) {
      setError({ message: 'That file is over 4 MB - compress it before uploading on a field connection.' });
      return;
    }
    setPending(true);
    try {
      const captionEl = e.currentTarget.elements.namedItem('caption') as HTMLInputElement | null;
      const caption = captionEl?.value.trim();
      await postFile(`/viewings/${viewingId}/media`, file, caption ? { caption } : undefined);
      setOk('Photograph attached to the listing as verified (field_officer) imagery.');
      if (inputRef.current) inputRef.current.value = '';
      if (captionEl) captionEl.value = '';
      await loadPhotos();
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. The photograph was not saved - try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack-sm">
      {error && <ApiAlert message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

      {loaded && photos.length > 0 && (
        <div className="photo-strip" role="list" aria-label="Photographs on this listing">
          {photos.map((p) => (
            <figure key={p.id} role="listitem" className="photo-strip-item">
              <img src={p.url} alt={p.caption ?? 'Listing photograph'} loading="lazy" />
              <figcaption>
                <span className="pill">{SOURCE_LABEL[p.source] ?? p.source}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="stack-sm">
        <div className="field">
          <label htmlFor="media-file">Photograph (JPEG, PNG or WebP, up to 4 MB)</label>
          <input
            ref={inputRef}
            id="media-file"
            type="file"
            accept={ACCEPTED}
            required
            disabled={pending}
          />
        </div>
        <div className="field">
          <label htmlFor="media-caption">Caption (optional)</label>
          <input
            id="media-caption"
            name="caption"
            type="text"
            maxLength={140}
            placeholder="Front entrance, north-facing sitting room…"
            disabled={pending}
          />
        </div>
        <button type="submit" className="btn" disabled={pending}>
          {pending ? 'Uploading…' : 'Attach photograph'}
        </button>
        <p className="hint">
          Photographs taken on this visit are labelled as verified imagery taken
          by our field officer - that label is the product, so capture the
          property honestly.
        </p>
      </form>
    </div>
  );
}
