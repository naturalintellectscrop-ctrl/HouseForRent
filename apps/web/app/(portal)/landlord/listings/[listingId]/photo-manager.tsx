'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadPhotoAction } from '@/app/actions/landlord';
import { IDLE, type ActionState } from '@/app/actions/state';
import { ApiAlert } from '@/app/ui';

/** The server's ceiling, mirrored so the browser can aim below it. */
const MAX_EDGE = 1600;
const TARGET_BYTES = 1_200_000;

/**
 * Downscales an image in the browser before upload.
 *
 * ── Why this is presentation, not a business rule ──
 * The server enforces its own 1.5MB ceiling and refuses anything above it
 * (413 PHOTO_TOO_LARGE) whether or not this ran. All this does is stop a
 * landlord on a phone connection spending four megabytes to be told no. It
 * cannot make an oversized image acceptable; it can only make an acceptable
 * one cheaper to send.
 *
 * The output is always JPEG: a phone camera photograph re-encoded as PNG is
 * several times larger for no visible gain.
 */
async function downscale(
  file: File,
): Promise<{ mimeType: string; dataBase64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot resize images.');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Step the quality down until it fits. Three attempts, then give up and
  // let the server refuse it rather than looping forever on a huge source.
  for (const quality of [0.82, 0.7, 0.58]) {
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) continue;
    if (blob.size <= TARGET_BYTES || quality === 0.58) {
      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return { mimeType: 'image/jpeg', dataBase64: btoa(binary) };
    }
  }
  throw new Error('Could not compress that image. Try a smaller one.');
}

export function PhotoManager({ listingId }: { listingId: string }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    uploadPhotoAction.bind(null, listingId),
    IDLE,
  );
  const [prepared, setPrepared] = useState<{
    mimeType: string;
    dataBase64: string;
    name: string;
  } | null>(null);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPrepError(null);
    setPrepared(null);
    if (!file) return;

    setPreparing(true);
    try {
      const { mimeType, dataBase64 } = await downscale(file);
      setPrepared({ mimeType, dataBase64, name: file.name });
    } catch (err) {
      setPrepError(
        err instanceof Error ? err.message : 'Could not read that file.',
      );
    } finally {
      setPreparing(false);
    }
  }

  return (
    <form action={submit} className="card stack">
      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}
      {state.ok ? <p className="notice notice-ok">{state.ok}</p> : null}
      {prepError ? (
        <p className="notice notice-error" role="alert">
          {prepError}
        </p>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="photo">
          Add a photograph
        </label>
        <input
          id="photo"
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="input"
          onChange={onPick}
        />
        <p className="hint">
          Resized in your browser before it is sent, so it does not cost you a
          large upload.
        </p>
      </div>

      {prepared ? (
        <>
          <input type="hidden" name="mimeType" value={prepared.mimeType} />
          <input type="hidden" name="dataBase64" value={prepared.dataBase64} />
          <div className="field">
            <label className="label" htmlFor="caption">
              Caption <span className="faint">(optional)</span>
            </label>
            <input
              id="caption"
              name="caption"
              className="input"
              maxLength={200}
              placeholder="The sitting room"
            />
          </div>
        </>
      ) : null}

      <button
        type="submit"
        className="btn btn-secondary"
        disabled={!prepared || pending || preparing}
      >
        {preparing
          ? 'Preparing…'
          : pending
            ? 'Uploading…'
            : prepared
              ? `Upload ${prepared.name}`
              : 'Choose a photograph first'}
      </button>
    </form>
  );
}
