'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { api, ApiError } from '@/lib/api';
import type { ActionState } from './state';

/**
 * Tenant-side actions. Every one is a thin forward to the backend.
 *
 * None of them decides whether the tenant may do the thing. The API reads
 * the tenant from the SESSION on every one of these calls — no action here
 * sends a party id, because none of these endpoints accepts one (API Spec
 * §7.3). That is what makes it impossible to book a viewing, or read a
 * deal, in someone else's name.
 */
function toState(err: unknown): ActionState {
  if (err instanceof ApiError) {
    return { error: err.message, code: err.code };
  }
  return {
    error:
      'Could not reach House For Rent. Nothing was saved — try again in a moment.',
  };
}

/**
 * FR-5.1 — request a viewing.
 *
 * The body carries the listing and the time, and nothing else. The tenant is
 * the caller; identity verification, service-corridor membership and whether
 * the listing is viewable at all are enforced server-side (422
 * TENANT_NOT_VERIFIED / OUTSIDE_SERVICE_AREA / LISTING_NOT_VIEWABLE). None
 * of those checks is repeated here — a second copy would be free to drift,
 * and the copy a tenant's browser holds is the one an attacker can rewrite.
 */
export async function requestViewingAction(
  listingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();

  if (!date || !time) {
    return { error: 'Choose a day and a time that suit you.' };
  }

  const scheduledFor = new Date(`${date}T${time}`);
  if (Number.isNaN(scheduledFor.getTime())) {
    return { error: 'That is not a time we could read. Try again.' };
  }
  if (scheduledFor.getTime() < Date.now()) {
    return { error: 'Choose a time in the future.' };
  }

  try {
    await api('/v1/viewings', {
      method: 'POST',
      body: { listingId, scheduledFor: scheduledFor.toISOString() },
    });
  } catch (err) {
    return toState(err);
  }

  redirect('/account/viewings?requested=1');
}

/**
 * Identity verification (FR-1.2, FR-1.4).
 *
 * ── Said plainly, because the alternative is a lie ──
 * V1 runs a MOCK identity provider. There is no NIN-register integration
 * yet: the endpoint records DPA-2019 consent, submits the three factors
 * across the provider boundary, and the mock returns verified. This action
 * therefore does not claim a government database was consulted, and neither
 * does the page that calls it. A product whose proposition is verification
 * cannot afford to overstate its own verification.
 *
 * Consent is a separate call made FIRST, because `IdentityService` refuses
 * to verify a party with no consent record — the ordering is enforced
 * server-side, not merely intended by this form.
 */
export async function verifyIdentityAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formData.get('consent') !== 'on') {
    return {
      error:
        'We need your consent before running identity checks (Data Protection and Privacy Act 2019).',
    };
  }

  const nin = String(formData.get('nin') ?? '').trim().toUpperCase();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!/^[A-Z0-9]{14}$/.test(nin)) {
    return {
      error:
        'A Ugandan National Identification Number is 14 letters and digits.',
    };
  }
  if (phone.length < 9) {
    return { error: 'Enter the phone number registered to your ID.' };
  }

  try {
    await api('/v1/identity/consent', {
      method: 'POST',
      body: { policyVersion: 'v1' },
    });
    await api('/v1/identity/verify', {
      method: 'POST',
      body: {
        nin,
        phone,
        // The V1 provider takes references, not bytes. Capturing a selfie in
        // the browser is worth building only against a provider that would
        // actually compare it to anything.
        selfieRef: 'web-pending-capture',
        idPhotoRef: 'web-pending-capture',
      },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: 'Your identity has been verified.' };
}
