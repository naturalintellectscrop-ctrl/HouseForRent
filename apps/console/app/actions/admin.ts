'use server';

import { refresh } from 'next/cache';
import { api, ApiError } from '@/lib/api';
import type { ActionState } from './state';

function toState(err: unknown): ActionState {
  if (err instanceof ApiError) {
    return { error: err.message, code: err.code };
  }
  return { error: 'Could not reach the House For Rent API.' };
}

/**
 * FR-10.1 / FR-7.4 — a rate change creates a NEW version.
 *
 * There is deliberately no "edit rate" action here, because there is no
 * endpoint to call: both tables are immutable in the database and the API
 * offers no path that would attempt it. In-flight deals hold snapshots and
 * are structurally unaffected by anything this form does.
 *
 * The console does NOT validate the rate beyond it being present. Range,
 * integrality and type are the server's call (it rejects 0, negatives,
 * fractions, out-of-range values and numeric strings), and duplicating
 * those bounds here would create a second set free to drift from the one
 * that actually binds.
 */
export async function createRateVersionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const raw = String(formData.get('rateBpOfMonth') ?? '').trim();
  if (!raw) {
    return { error: 'Enter a rate in basis points of one month’s rent.' };
  }

  const effectiveFrom = String(formData.get('effectiveFrom') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  try {
    await api('/v1/admin/commission-rates', {
      method: 'POST',
      body: {
        // Sent as a number because the endpoint takes basis points, an
        // integer count — not money. Money would be a string.
        rateBpOfMonth: Number(raw),
        ...(effectiveFrom
          ? { effectiveFrom: new Date(effectiveFrom).toISOString() }
          : {}),
        ...(note ? { note } : {}),
      },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return {
    error: null,
    ok: 'New rate version created. Deals already signed keep their snapshot.',
  };
}

/** FR-10.1 — a config change is a NEW version, never an edit. */
export async function createConfigVersionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const key = String(formData.get('key') ?? '').trim();
  const raw = String(formData.get('value') ?? '').trim();
  const effectiveFrom = String(formData.get('effectiveFrom') ?? '').trim();

  if (!key || !raw) {
    return { error: 'Both a parameter key and a value are required.' };
  }

  // Config values are typed by their parameter row (int / json / text), so
  // the form accepts JSON and lets the server be the judge of the type.
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return {
      error:
        'Value must be valid JSON — a number (7), a string ("v2") or an array (["identity"]).',
    };
  }

  try {
    await api(`/v1/admin/config/${encodeURIComponent(key)}/versions`, {
      method: 'POST',
      body: {
        value,
        ...(effectiveFrom
          ? { effectiveFrom: new Date(effectiveFrom).toISOString() }
          : {}),
      },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return {
    error: null,
    ok: `New version of "${key}" created. A future-dated version stays invisible until its date.`,
  };
}
