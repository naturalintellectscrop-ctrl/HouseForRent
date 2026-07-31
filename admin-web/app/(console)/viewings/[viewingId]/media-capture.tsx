'use client';

import { useActionState, useState } from 'react';
import { captureMediaAction } from '../../../actions/viewings';
import { IDLE, type ActionState } from '../../../actions/state';

/**
 * FR-5.5 — professional media captured during the field visit.
 *
 * `capture` on the file input opens the phone camera directly rather than a
 * file browser, which is the actual field gesture.
 *
 * ── Why this posts metadata, not bytes ──
 * The V1 storage provider is a mock behind `MediaStorageProvider`; the real
 * object store is procurement-gated (SSOT §8). So the form reads the file's
 * kind, MIME type and size locally and submits those with an opaque source
 * reference. The server still runs the whole policy path — accepted MIME
 * set, source ceiling, the three-rung ladder and its byte ceilings — so
 * everything that governs low-bandwidth behaviour is genuinely exercised.
 * Swapping in a real store changes the transport here and nothing else.
 */
export function MediaCapture({ viewingId }: { viewingId: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    captureMediaAction.bind(null, viewingId),
    IDLE,
  );
  const [picked, setPicked] = useState<{
    kind: 'image' | 'video';
    mimeType: string;
    size: number;
    name: string;
  } | null>(null);

  return (
    <form action={action}>
      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}
      {state.ok && <p className="alert alert-ok">{state.ok}</p>}

      <div className="field">
        <label htmlFor="file">Photo or video</label>
        <input
          id="file"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          capture="environment"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              setPicked(null);
              return;
            }
            setPicked({
              kind: file.type.startsWith('video/') ? 'video' : 'image',
              mimeType: file.type,
              size: file.size,
              name: file.name,
            });
          }}
        />
        <p className="hint">
          The server compresses to a three-rung ladder (thumb / low /
          standard) so this loads on a weak connection.
        </p>
      </div>

      {picked && (
        <>
          <p className="muted">
            {picked.name} · {picked.mimeType} ·{' '}
            {(picked.size / 1024).toFixed(0)} KB
          </p>
          <input type="hidden" name="kind" value={picked.kind} />
          <input type="hidden" name="mimeType" value={picked.mimeType} />
          <input type="hidden" name="sourceByteSize" value={picked.size} />
          <input
            type="hidden"
            name="sourceRef"
            value={`${viewingId}:${picked.name}`}
          />
        </>
      )}

      <button
        type="submit"
        className="btn-secondary"
        disabled={pending || !picked}
      >
        {pending ? 'Uploading…' : 'Add to visit'}
      </button>
    </form>
  );
}
