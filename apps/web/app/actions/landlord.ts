'use server';

import { redirect } from 'next/navigation';
import { refresh } from 'next/cache';
import { api, ApiError } from '@/lib/api';
import type { ActionState } from './state';

/**
 * Landlord actions. Every one is a thin forward to the backend.
 *
 * ── What none of them do ──
 * None checks that the caller owns the property. `ListingsService` asserts
 * ownership on every mutating path (403 NOT_THE_PROPERTY_OWNER, F-016), and
 * a duplicate check here would be a second copy of an authorisation rule
 * living on the side an attacker controls. A landlord who is refused sees
 * the server's own reason.
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

const SHILLINGS = /^[0-9]+$/;

/** Strips grouping so "1,400,000" and "1 400 000" both submit cleanly. */
function shillingsField(raw: FormDataEntryValue | null): string {
  return String(raw ?? '').replace(/[\s,]/g, '');
}

/**
 * Creates the property AND its listing in one submission.
 *
 * ── Why one form for two resources ──
 * A landlord does not think "I will describe a property, and separately
 * publish terms against it". They think "I want to let this flat for 1.4m".
 * Splitting the form to mirror the schema would be the database's shape
 * imposed on the person, and would strand anyone who abandoned it halfway
 * with a property that cannot be listed or found.
 *
 * The two API calls stay separate because the resources are separate: a
 * property genuinely can carry more than one listing over its life. If the
 * second call fails, the property exists and the landlord is told to add
 * terms to it — an honest partial state, not a lie about a rollback that
 * did not happen.
 */
export async function createPropertyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const neighbourhoodId = String(formData.get('neighbourhoodId') ?? '');
  const landmarkText = String(formData.get('landmarkText') ?? '').trim();
  const propertyType = String(formData.get('propertyType') ?? '');
  const furnished = String(formData.get('furnished') ?? '');
  const bedrooms = Number(formData.get('bedrooms') ?? NaN);
  const bathrooms = Number(formData.get('bathrooms') ?? NaN);

  const monthlyRent = shillingsField(formData.get('monthlyRent'));
  const depositAmount = shillingsField(formData.get('depositAmount'));
  const requiredMonthsUpfront = Number(
    formData.get('requiredMonthsUpfront') ?? NaN,
  );
  const descriptionText = String(formData.get('descriptionText') ?? '').trim();
  const streetAddress = String(formData.get('streetAddress') ?? '').trim();

  if (!neighbourhoodId) {
    return { error: 'Choose the neighbourhood the property is in.' };
  }
  if (landmarkText.length < 4) {
    return {
      error:
        'Give us a landmark — how you would tell a driver where to turn off.',
    };
  }
  if (!Number.isInteger(bedrooms) || !Number.isInteger(bathrooms)) {
    return { error: 'Enter the number of bedrooms and bathrooms.' };
  }
  if (!SHILLINGS.test(monthlyRent) || monthlyRent === '0') {
    return { error: 'Enter the monthly rent in shillings.' };
  }
  if (!SHILLINGS.test(depositAmount)) {
    return { error: 'Enter the deposit in shillings (0 if there is none).' };
  }
  if (!Number.isInteger(requiredMonthsUpfront) || requiredMonthsUpfront < 1) {
    return { error: 'How many months are payable upfront? At least one.' };
  }

  let listingId: string;
  try {
    // The owner is read from the session — this body cannot name one.
    const property = await api<{ id: string }>('/v1/properties', {
      method: 'POST',
      body: {
        propertyType,
        bedrooms,
        bathrooms,
        furnished,
        neighbourhoodId,
        landmarkText,
        ...(streetAddress ? { streetAddress } : {}),
      },
    });

    const listing = await api<{ id: string }>('/v1/listings', {
      method: 'POST',
      body: {
        propertyId: property.id,
        // Money crosses as a STRING of integer shillings, never a number.
        monthlyRent,
        depositAmount,
        requiredMonthsUpfront,
        ...(descriptionText ? { descriptionText } : {}),
      },
    });
    listingId = listing.id;
  } catch (err) {
    return toState(err);
  }

  redirect(`/landlord/listings/${listingId}?created=1`);
}

/**
 * FR-9.1 — accept the listing agreement.
 *
 * `expectedRateVersionId` is sent back exactly as presented. If the
 * published rate changed between the landlord reading the terms and
 * accepting them, the server refuses rather than binding them to a rate
 * they never saw. That is the whole reason the field exists, so it is never
 * omitted here.
 */
export async function acceptAgreementAction(
  listingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formData.get('accept') !== 'on') {
    return {
      error:
        'Tick the box to confirm you accept the commission terms and the circumvention clause.',
    };
  }

  const expectedRateVersionId = String(
    formData.get('expectedRateVersionId') ?? '',
  ).trim();
  const clauseVersion = String(formData.get('clauseVersion') ?? '').trim();

  try {
    await api(`/v1/listings/${listingId}/agreement/accept`, {
      method: 'POST',
      body: {
        ...(expectedRateVersionId ? { expectedRateVersionId } : {}),
        ...(clauseVersion ? { clauseVersion } : {}),
      },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: 'Agreement accepted.' };
}

/**
 * Publishes a listing.
 *
 * The four publish preconditions — verified, in corridor, agreement
 * accepted, mandate where required — are enforced in `ListingsService`
 * (FR-2.5, FR-3.1, FR-3.2, FR-9.1). This does not pre-check any of them.
 * The landlord's own `blockedBy` list, which the server computes, is what
 * the page shows.
 */
export async function publishListingAction(
  listingId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await api(`/v1/listings/${listingId}/publish`, { method: 'POST' });
  } catch (err) {
    return toState(err);
  }
  refresh();
  return { error: null, ok: 'Your property is live. Tenants can find it now.' };
}

export async function withdrawListingAction(
  listingId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await api(`/v1/listings/${listingId}/withdraw`, { method: 'POST' });
  } catch (err) {
    return toState(err);
  }
  refresh();
  return {
    error: null,
    ok: 'Withdrawn. It is no longer in search; you can publish it again later.',
  };
}

/**
 * Uploads a photograph.
 *
 * ── The downscale happens in the BROWSER ──
 * The client redraws the image onto a canvas at no more than 1600px before
 * encoding it, so what crosses the wire is already the size the server
 * accepts. That is presentation work, not a business rule: the server
 * enforces its own ceiling regardless (413 PHOTO_TOO_LARGE), and a client
 * that skipped the step is refused rather than trusted.
 *
 * Provenance is NOT sent. The server derives it from the caller's role —
 * a landlord's upload can never be labelled as officer photography.
 */
export async function uploadPhotoAction(
  listingId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const mimeType = String(formData.get('mimeType') ?? '');
  const dataBase64 = String(formData.get('dataBase64') ?? '');
  const caption = String(formData.get('caption') ?? '').trim();

  if (!dataBase64) {
    return { error: 'Choose a photograph to upload.' };
  }

  try {
    await api(`/v1/listings/${listingId}/photos`, {
      method: 'POST',
      body: { mimeType, dataBase64, ...(caption ? { caption } : {}) },
    });
  } catch (err) {
    return toState(err);
  }

  refresh();
  return { error: null, ok: 'Photograph added.' };
}

export async function removePhotoAction(
  listingId: string,
  photoId: string,
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  try {
    await api(`/v1/listings/${listingId}/photos/${photoId}/remove`, {
      method: 'POST',
    });
  } catch (err) {
    return toState(err);
  }
  refresh();
  return { error: null, ok: 'Photograph removed.' };
}
