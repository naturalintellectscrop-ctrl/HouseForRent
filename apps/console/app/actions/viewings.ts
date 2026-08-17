'use server';

import { refresh } from 'next/cache';
import { api, ApiError } from '@/lib/api';
import type { ActionState } from './state';

/**
 * Every action here is a thin forward to the backend.
 *
 * None of them decides whether the operation is permitted, whether the
 * viewing is in a valid state, or whether the evidence is sufficient — the
 * backend does, and a copy of those rules here would be a second copy free
 * to drift (Technical Architecture §7). What these DO own is turning a
 * rejection into something a field officer can read.
 */
function toState(err: unknown): ActionState {
  if (err instanceof ApiError) {
    return { error: err.message, code: err.code };
  }
  return {
    error:
      'Could not reach the House For Rent API. Your work was not saved — try again when you have signal.',
  };
}

/**
 * FR-5.2 — dispatch. Sends an officer to a requested viewing.
 *
 * [F-002] This is the action that had no caller. `POST /assign` was built
 * and tested at Stage 7 and nothing in either client invoked it, so every
 * requested viewing stayed requested and the tenant journey ended one step
 * after "request a viewing".
 *
 * Note what is NOT checked here: whether the officer holds a `foo` account,
 * and whether the listing sits inside the service corridor. Both are
 * server-side guards on `assign()` (422 NOT_A_FIELD_OFFICER /
 * OUTSIDE_SERVICE_AREA). Re-checking them in this console would be a second
 * copy of a dispatch rule, free to drift from the one that actually binds.
 */
export async function assignViewingAction(
  viewingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const fooPartyId = String(formData.get('fooPartyId') ?? '').trim();
  if (!fooPartyId) {
    return { error: 'Choose a field officer to send.' };
  }

  // Optional: dispatch may move the time the tenant proposed. Absent means
  // "keep it", which the backend treats as such — it does not default to now.
  const scheduledFor = String(formData.get('scheduledFor') ?? '').trim();

  try {
    await api(`/v1/viewings/${viewingId}/assign`, {
      method: 'POST',
      body: {
        fooPartyId,
        ...(scheduledFor
          ? { scheduledFor: new Date(scheduledFor).toISOString() }
          : {}),
      },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return {
    error: null,
    ok: 'Assigned. It now appears on that officer’s board and the tenant sees it as scheduled.',
  };
}

/** FR-5.4 — file the structured field report. */
export async function submitFieldReportAction(
  viewingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const conditionRating = String(formData.get('conditionRating') ?? '');
  const matchesListing = formData.get('matchesListing');
  const isAvailable = formData.get('isAvailable');

  // Presence checks only — these three are required because the report is
  // structured (FR-5.4), and an unanswered radio would otherwise submit as
  // absent. The backend validates the VALUES; this just avoids a pointless
  // round trip on a field connection.
  if (!conditionRating || matchesListing === null || isAvailable === null) {
    return {
      error:
        'Condition, accuracy and availability are all required — they are the structured part of the report.',
    };
  }

  const mediaAssetIds = String(formData.get('mediaAssetIds') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    await api(`/v1/viewings/${viewingId}/field-report`, {
      method: 'POST',
      body: {
        conditionRating,
        matchesListing: matchesListing === 'true',
        isAvailable: isAvailable === 'true',
        issuesText: String(formData.get('issuesText') ?? '').trim() || undefined,
        timingNote: String(formData.get('timingNote') ?? '').trim() || undefined,
        ...(mediaAssetIds.length ? { mediaAssetIds } : {}),
      },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: 'Report filed. Availability freshness updated.' };
}

/**
 * FR-5.3 — close the visit and mint the introduction record.
 *
 * The console does not check for a field report first. The backend refuses
 * without one (422 FIELD_REPORT_REQUIRED) and the database refuses beneath
 * it; pre-checking here would only add a rule that could drift out of step
 * with the two that actually hold.
 */
export async function conductAction(
  viewingId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await api(`/v1/viewings/${viewingId}/conduct`, {
      method: 'POST',
      body: {},
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: 'Visit closed. Introduction record created.' };
}

/** FR-5.2 — no-shows are tracked, not deleted. */
export async function noShowAction(
  viewingId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await api(`/v1/viewings/${viewingId}/no-show`, {
      method: 'POST',
      body: {},
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: 'Recorded as a no-show.' };
}

/**
 * FR-5.5 — register a capture.
 *
 * The V1 storage provider is a mock, so what crosses the wire is the file's
 * METADATA (kind, MIME type, byte size) and an opaque source reference —
 * not the bytes. The compression ladder and its ceilings are enforced
 * server-side either way, so this call exercises the real policy path; when
 * a real object store replaces the mock, only the transport changes.
 */
export async function captureMediaAction(
  viewingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const kind = String(formData.get('kind') ?? '');
  const mimeType = String(formData.get('mimeType') ?? '');
  const sourceByteSize = Number(formData.get('sourceByteSize') ?? 0);
  const sourceRef = String(formData.get('sourceRef') ?? '').trim();

  if (!kind || !mimeType || !sourceByteSize || !sourceRef) {
    return { error: 'Choose a file before adding it to the report.' };
  }

  let assetId: string;
  try {
    const result = await api<{ asset: { id: string } }>(
      `/v1/viewings/${viewingId}/media`,
      {
        method: 'POST',
        body: { kind, mimeType, sourceByteSize, sourceRef },
      },
    );
    assetId = result.asset.id;
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: `Captured. Asset ${assetId.slice(0, 8)}.` };
}
