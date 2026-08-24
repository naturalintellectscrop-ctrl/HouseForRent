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
 * FR-8.3 — open the deal that follows an introduction.
 *
 * [F-001] `POST /v1/deals` did not exist at all until this fix; the service
 * method behind it was reachable only from test files, so no rental could
 * ever be created in the real product no matter how completely escrow,
 * commission and settlement were built beneath it.
 *
 * The action sends ONE field. It cannot name the tenant, the landlord or the
 * listing, because the endpoint does not accept them — the server reads all
 * three from the introduction record it was given. A console that passed
 * parties would be a console an attacker could rewrite.
 *
 * A second attempt on the same introduction is refused by the backend with
 * 409 DEAL_ALREADY_EXISTS, whose message names the existing deal. This does
 * not pre-check for one: the console holds no opinion about when a duplicate
 * is legitimate, and the rule that a terminal deal does not block a retry
 * lives in one place.
 */
export async function openDealAction(
  introductionRecordId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  let dealId: string;
  try {
    const deal = await api<{ id: string }>('/v1/deals', {
      method: 'POST',
      body: { introductionRecordId },
    });
    dealId = deal.id;
  } catch (err) {
    return toState(err);
  }

  refresh();
  return {
    error: null,
    ok: `Deal ${dealId.slice(0, 8)} opened. The tenant can now see it, and it is waiting on the match-tenant step.`,
  };
}

/**
 * Perform one deal transition (F-007).
 *
 * ── One action for all eleven transitions, on purpose ──
 * The `action` segment and the field names both come from the server's
 * `availableActions`. There is no switch here on deal status, no per-action
 * branch, and no list of which transitions exist — because every one of
 * those would be a copy of the state machine living in the console. If a
 * transition is added, removed or re-scoped in the backend, this action
 * carries it without being touched.
 *
 * ── Why it refreshes even when the call FAILS ──
 * The most likely rejection is 409 ILLEGAL_TRANSITION, and the most likely
 * cause of that is a second operator having acted on the same deal since
 * this page was rendered. Leaving the stale page on screen would show a
 * deal in a status it no longer holds, with actions it no longer permits —
 * so the page is re-fetched from the server either way, and the operator
 * reads the real state next to the rejection.
 *
 * Nothing here reports success on its own authority: the status shown after
 * an action is the one the server returned on the refetch, never one this
 * console predicted.
 */
export async function dealTransitionAction(
  dealId: string,
  action: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    // `confirm` is the operator's acknowledgement checkbox. It is a UI
    // safeguard against a mis-click, not a business field — the endpoints
    // use `forbidNonWhitelisted`, so sending it would be a 400.
    if (key === 'confirm' || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) body[key] = trimmed;
  }

  try {
    await api(`/v1/deals/${dealId}/${action}`, { method: 'POST', body });
  } catch (err) {
    refresh();
    if (err instanceof ApiError) {
      if (err.code === 'ILLEGAL_TRANSITION') {
        return {
          error: `${err.message} This deal is no longer in the state this page was showing — someone else has acted on it. The state above has been reloaded from the server.`,
          code: err.code,
        };
      }
      return { error: err.message, code: err.code };
    }
    return {
      error:
        'Could not reach the House For Rent API. Nothing was changed — the deal is in whatever state the server last recorded.',
    };
  }

  refresh();
  return {
    error: null,
    ok: 'Done. The state and figures above have been reloaded from the server.',
  };
}
