'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postJson } from '@/lib/client';
import { Icon } from '@/app/ui';

/**
 * The save/bookmark toggle on a property page.
 *
 * ── Why optimistic only in one direction ──
 * Saving is idempotent and cheap, so the control flips immediately on save.
 * Un-saving also flips immediately (DELETE is idempotent too). The server
 * is still the only place that knows the truth: after either call the page
 * refreshes its server data, so a stale tab can never show a bookmark the
 * server does not have.
 *
 * ── What saving is NOT ──
 * Not a viewing request, not an expression of interest to anyone. The
 * landlord cannot see who saved their home. The copy says so, because a
 * tenant hesitating over a button that might "notify" the landlord is a
 * hesitation we caused.
 */
export function SaveToggle({
  listingId,
  initiallySaved,
}: {
  listingId: string;
  initiallySaved: boolean;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function toggle() {
    if (pending) return;
    setPending(true);
    const next = !saved;
    setSaved(next);
    try {
      await postJson(
        `/listings/${listingId}/saved`,
        undefined,
        next ? 'POST' : 'DELETE',
      );
      startTransition(() => router.refresh());
    } catch {
      // Roll the control back and let the label say the truth.
      setSaved(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      className="btn btn-secondary btn-block"
    >
      {saved ? <Icon.bookmarkFilled size={16} /> : <Icon.bookmark size={16} />}
      {saved ? 'Saved to my homes' : 'Save this home'}
    </button>
  );
}
