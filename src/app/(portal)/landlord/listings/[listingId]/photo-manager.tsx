'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { postFile, postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/** The same 4 MB ceiling the server enforces (MEDIA_MAX_BYTES default) —
 * checked here only to save the landlord a doomed upload; the server's
 * refusal is the real gate. */
const MAX_BYTES_HINT = 4_000_000;

export interface ManagedPhoto {
  id: string;
  mediaAssetId: string;
  source: string;
  caption: string | null;
}

/**
 * The photograph control on a landlord's listing.
 *
 * ── What a landlord may and may not do with photography ──
 * They can photograph their OWN listing, before it is published. Their
 * uploads wear the "Uploaded by you" provenance label - never the officer's
 * "taken in the actual room" label, which is the product's whole
 * verification promise. Once the listing is live the window closes (the
 * server refuses too): a live gallery is managed by staff so a tenant's
 * search result cannot be quietly re-photographed. Officer photography is
 * the verification record - the landlord cannot delete it, only staff can.
 */
export function PhotoManager({
  listingId,
  publicationState,
  photos,
}: {
  listingId: string;
  publicationState: string;
  photos: ManagedPhoto[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const editable = publicationState !== 'live' && publicationState !== 'rented';
  const ownPhotos = photos.filter((p) => p.source === 'lister');

  function pick(f: File | null) {
    setError(null);
    setOk(null);
    setFile(f);
  }

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!file) {
      setError({ message: 'Choose a photograph first.' });
      return;
    }
    if (file.size === 0) {
      setError({ message: 'That file is empty - choose the actual photograph.' });
      return;
    }
    if (file.size > MAX_BYTES_HINT) {
      setError({ message: 'That file is over 4 MB. A smaller copy will upload fine.' });
      return;
    }
    setUploading(true);
    try {
      await postFile(`/landlord/listings/${listingId}/photos`, file, caption.trim() ? { caption: caption.trim() } : undefined);
      setFile(null);
      setCaption('');
      if (fileInput.current) fileInput.current.value = '';
      setOk('Photograph added. It is labelled as your own upload.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        const friendly: Record<string, string> = {
          MEDIA_TYPE_NOT_ACCEPTED: 'Only JPEG and PNG photographs are accepted.',
          MEDIA_TYPE_MISMATCH: 'The file is not the image type it claims to be.',
          MEDIA_TOO_LARGE: 'That file is over the 4 MB limit.',
          PHOTO_LIMIT_REACHED: 'A listing carries at most 12 photographs.',
          MEDIA_WINDOW_CLOSED: 'This listing is live - withdraw it before changing your photographs.',
          MEDIA_STORE_UNAVAILABLE: 'The photo store is not reachable right now. Nothing was added - try again shortly.',
          NOT_YOUR_LISTING: 'This listing is not yours to photograph.',
        };
        setError({
          message: friendly[err.code] ?? err.message,
          code: err.code,
        });
      } else {
        setError({ message: 'Could not reach House For Rent. Nothing was added - try again in a moment.' });
      }
    } finally {
      setUploading(false);
    }
  }

  async function onRemove(photo: ManagedPhoto) {
    setError(null);
    setOk(null);
    setRemovingId(photo.id);
    try {
      await postJson(`/landlord/listings/${listingId}/photos`, { mediaAssetId: photo.mediaAssetId }, 'DELETE');
      setOk('Photograph removed.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({ message: 'Could not reach House For Rent. Nothing was removed - try again in a moment.' });
      }
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="card stack-sm">
      <h3 className="h3" style={{ margin: 0 }}>
        Photography
      </h3>

      {editable ? (
        <form onSubmit={onUpload} className="stack-sm">
          <p className="muted" style={{ margin: 0 }}>
            Add photographs of the property. JPEG or PNG, up to 4&nbsp;MB each,
            at most 12 per listing. They are labelled as your own uploads -
            the officer&rsquo;s verification photographs are the ones tenants
            see as verified.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="input"
            aria-label="Choose a photograph (JPEG or PNG, up to 4 MB)"
          />
          <input
            type="text"
            className="input"
            placeholder="Caption (optional) - e.g. Sitting room, afternoon light"
            value={caption}
            maxLength={120}
            onChange={(e) => setCaption(e.target.value)}
            aria-label="Photograph caption (optional)"
          />
          {error ? <ApiAlert message={error.message} code={error.code} /> : null}
          {ok ? (
            <p className="notice notice-ok" role="status">
              {ok}
            </p>
          ) : null}
          <div>
            <button type="submit" className="btn btn-secondary" disabled={uploading || !file}>
              {uploading ? 'Adding…' : 'Add the photograph'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            This listing is live. Its photographs are managed by staff while
            it is published - withdraw the listing if you need to change
            yours.
          </p>
          <button type="button" className="btn btn-secondary" disabled>
            Add a photograph
          </button>
          <p className="hint">Not available while the listing is live.</p>
        </>
      )}

      {ownPhotos.length > 0 ? (
        <div className="stack-sm">
          <h4 className="h4" style={{ margin: 0 }}>
            Your uploads
          </h4>
          <ul className="list" style={{ margin: 0 }}>
            {ownPhotos.map((p) => (
              <li key={p.id} className="list-item row-between">
                <span className="stack-sm">
                  <span className="card-title">{p.caption || `Photograph #${p.mediaAssetId.slice(-6)}`}</span>
                  <span className="faint" style={{ fontSize: '0.8125rem' }}>
                    Uploaded by you - removable while the listing is unpublished
                  </span>
                </span>
                {editable ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => onRemove(p)}
                    disabled={removingId === p.id}
                    aria-label={`Remove ${p.caption || 'your photograph'}`}
                  >
                    {removingId === p.id ? 'Removing…' : 'Remove'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
