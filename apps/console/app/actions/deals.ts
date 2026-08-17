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
