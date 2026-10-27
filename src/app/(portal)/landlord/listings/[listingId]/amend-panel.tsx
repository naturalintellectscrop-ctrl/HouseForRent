'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import type { Neighbourhood } from '@/lib/contract';
import { ApiAlert } from '@/app/ui';

/** Groups shillings for display only. The submitted value is stripped clean. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export interface AmendPrefill {
  propertyType: string;
  furnished: string;
  neighbourhoodId: string;
  landmarkText: string;
  streetAddress: string | null;
  descriptionText: string | null;
  monthlyRent: string;
  depositAmount: string;
  requiredMonthsUpfront: number;
  bedrooms: number;
  bathrooms: number;
}

interface AmendResult {
  changedFields: string[];
  reVerificationRequired: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  propertyType: 'property type',
  bedrooms: 'bedrooms',
  bathrooms: 'bathrooms',
  furnished: 'furnishing',
  neighbourhoodId: 'neighbourhood',
  landmarkText: 'landmark',
  streetAddress: 'street address',
  monthlyRent: 'monthly rent',
  depositAmount: 'deposit',
  requiredMonthsUpfront: 'months upfront',
  descriptionText: 'description',
};

/**
 * Amend details & terms of an UNPUBLISHED listing.
 *
 * ── Why collapsible ──
 * Amending is a correction, not a daily act; the page's first job is the
 * publish path. The form stays shut until the landlord asks for it, and the
 * fields arrive prefilled with the server's current state — a landlord
 * should edit what IS, not re-type what was.
 *
 * ── The re-verification warning is the server's answer, restated ──
 * The server decides whether a physical change re-opens field verification
 * (see `amendListing`). This panel renders that verdict as a warning; it
 * never computes the consequence itself.
 */
export function AmendPanel({
  listingId,
  prefill,
  neighbourhoods,
}: {
  listingId: string;
  prefill: AmendPrefill;
  neighbourhoods: Neighbourhood[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [result, setResult] = useState<AmendResult | null>(null);

  const digits = (v: string) => v.replace(/[^0-9]/g, '');
  const [rent, setRent] = useState(prefill.monthlyRent.replace(/[^0-9]/g, ''));
  const [deposit, setDeposit] = useState(prefill.depositAmount.replace(/[^0-9]/g, ''));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const data = new FormData(e.currentTarget);
    const payload = {
      propertyType: String(data.get('propertyType') ?? ''),
      bedrooms: Number(data.get('bedrooms') ?? NaN),
      bathrooms: Number(data.get('bathrooms') ?? NaN),
      furnished: String(data.get('furnished') ?? ''),
      neighbourhoodId: String(data.get('neighbourhoodId') ?? ''),
      landmarkText: String(data.get('landmarkText') ?? '').trim(),
      streetAddress: String(data.get('streetAddress') ?? '').trim(),
      monthlyRent: rent,
      depositAmount: deposit,
      requiredMonthsUpfront: Number(data.get('requiredMonthsUpfront') ?? NaN),
      descriptionText: String(data.get('descriptionText') ?? '').trim(),
    };

    // The same pre-flight the creation form makes — the server re-checks
    // everything; these only save the round trip.
    if (!payload.neighbourhoodId) {
      setError({ message: 'Choose the neighbourhood the property is in.' });
      return;
    }
    if (payload.landmarkText.length < 4) {
      setError({ message: 'Give us a landmark — how you would tell a driver where to turn off.' });
      return;
    }
    if (!Number.isInteger(payload.bedrooms) || !Number.isInteger(payload.bathrooms)) {
      setError({ message: 'Enter the number of bedrooms and bathrooms.' });
      return;
    }
    if (!/^[0-9]+$/.test(payload.monthlyRent) || payload.monthlyRent === '0') {
      setError({ message: 'Enter the monthly rent in shillings.' });
      return;
    }
    if (!/^[0-9]+$/.test(payload.depositAmount)) {
      setError({ message: 'Enter the deposit in shillings (0 if there is none).' });
      return;
    }
    if (!Number.isInteger(payload.requiredMonthsUpfront) || payload.requiredMonthsUpfront < 1) {
      setError({ message: 'How many months are payable upfront? At least one.' });
      return;
    }

    setPending(true);
    try {
      const res = await postJson<AmendResult>(`/landlord/listings/${listingId}/amend`, payload);
      setResult(res);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message: 'Could not reach House For Rent. Nothing was saved - try again in a moment.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <div className="card stack-sm">
        <h2 className="h3">Amend details</h2>
        <p className="muted">
          Something wrong in the rooms, the terms, or the words? Correct it
          here while the listing is not live.
        </p>
        {result && !error ? (
          <p className="notice notice-ok" role="status">
            Saved
            {result.changedFields.length > 0
              ? ` — updated: ${result.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.`
              : ' — nothing needed changing.'}
            {result.reVerificationRequired
              ? ' Because the home itself changed, our officer needs to visit again before it can publish.'
              : ''}
          </p>
        ) : null}
        <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          Amend details &amp; terms
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <h2 className="h3">Amend details &amp; terms</h2>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      {result && !error ? (
        <p className="notice notice-ok" role="status">
          Saved
          {result.changedFields.length > 0
            ? ` — updated: ${result.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(', ')}.`
            : ' — nothing needed changing.'}
          {result.reVerificationRequired
            ? ' Because the home itself changed, our officer needs to visit again before it can publish.'
            : ''}
        </p>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="amend-neighbourhoodId">
          Neighbourhood
        </label>
        <select
          id="amend-neighbourhoodId"
          name="neighbourhoodId"
          className="select"
          required
          defaultValue={prefill.neighbourhoodId}
        >
          {neighbourhoods.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
              {n.parentName ? ` - ${n.parentName}` : ''}
            </option>
          ))}
        </select>
        <p className="hint">Moving the home out of our coverage re-opens verification.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-landmarkText">
          Landmark
        </label>
        <input
          id="amend-landmarkText"
          name="landmarkText"
          className="input"
          required
          minLength={4}
          maxLength={160}
          defaultValue={prefill.landmarkText}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-streetAddress">
          Street address <span className="faint">(optional)</span>
        </label>
        <input
          id="amend-streetAddress"
          name="streetAddress"
          className="input"
          maxLength={160}
          defaultValue={prefill.streetAddress ?? ''}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-propertyType">
          Type
        </label>
        <select
          id="amend-propertyType"
          name="propertyType"
          className="select"
          required
          defaultValue={prefill.propertyType}
        >
          <option value="apartment">Apartment</option>
          <option value="house">House</option>
          <option value="room">Single room</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="row" style={{ gap: '1rem', alignItems: 'flex-start' }}>
        <div className="field" style={{ flex: '1 1 8rem', margin: 0 }}>
          <label className="label" htmlFor="amend-bedrooms">
            Bedrooms
          </label>
          <input
            id="amend-bedrooms"
            name="bedrooms"
            type="number"
            className="input"
            required
            min={0}
            max={20}
            defaultValue={prefill.bedrooms}
          />
        </div>
        <div className="field" style={{ flex: '1 1 8rem', margin: 0 }}>
          <label className="label" htmlFor="amend-bathrooms">
            Bathrooms
          </label>
          <input
            id="amend-bathrooms"
            name="bathrooms"
            type="number"
            className="input"
            required
            min={0}
            max={20}
            defaultValue={prefill.bathrooms}
          />
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-furnished">
          Furnishing
        </label>
        <select
          id="amend-furnished"
          name="furnished"
          className="select"
          required
          defaultValue={prefill.furnished}
        >
          <option value="furnished">Furnished</option>
          <option value="semi_furnished">Part furnished</option>
          <option value="unfurnished">Unfurnished</option>
        </select>
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-descriptionText">
          Description <span className="faint">(optional)</span>
        </label>
        <textarea
          id="amend-descriptionText"
          name="descriptionText"
          className="textarea"
          maxLength={1200}
          defaultValue={prefill.descriptionText ?? ''}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-monthlyRent">
          Monthly rent (UGX)
        </label>
        <input
          id="amend-monthlyRent"
          name="monthlyRent"
          className="input num"
          inputMode="numeric"
          required
          value={group(rent)}
          onChange={(e) => setRent(digits(e.target.value))}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-depositAmount">
          Deposit (UGX)
        </label>
        <input
          id="amend-depositAmount"
          name="depositAmount"
          className="input num"
          inputMode="numeric"
          required
          value={group(deposit)}
          onChange={(e) => setDeposit(digits(e.target.value))}
        />
        <p className="hint">Enter 0 if you are not asking for one.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="amend-requiredMonthsUpfront">
          Months payable upfront
        </label>
        <input
          id="amend-requiredMonthsUpfront"
          name="requiredMonthsUpfront"
          type="number"
          className="input"
          required
          min={1}
          max={24}
          defaultValue={prefill.requiredMonthsUpfront}
        />
      </div>

      <div className="row" style={{ gap: '0.75rem' }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
            setResult(null);
          }}
        >
          Keep as is
        </button>
      </div>
      <p className="hint">
        Changing the home itself — the rooms, the type, the furnishing, or
        where it is — means our officer has to visit again before the listing
        can publish. Changing the terms does not.
      </p>
    </form>
  );
}
