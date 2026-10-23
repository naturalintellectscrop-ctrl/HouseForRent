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

/**
 * One form, two resources: the property and its first listing terms are
 * created together by `POST /v1/landlord/properties`, because a landlord
 * does not think "I will describe a property, and separately publish terms
 * against it". The owner is read from the session server-side - nothing
 * here can name one.
 *
 * Money crosses as a STRING of integer shillings, never a number.
 */
export function PropertyForm({
  neighbourhoods,
}: {
  neighbourhoods: Neighbourhood[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(
    null,
  );

  /**
   * ── Why the money fields are controlled ──
   * A landlord typing 1400000 cannot see at a glance whether that is 1.4m or
   * 14m, and a mistyped rent is the figure a tenant will be asked to fund.
   * Grouping as they type is the cheapest possible guard against a
   * factor-of-ten error, and it costs one piece of state.
   *
   * The value SUBMITTED is the raw digits - the server takes a string of
   * integer shillings and would reject the grouped form.
   */
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');

  const digits = (v: string) => v.replace(/[^0-9]/g, '');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const data = new FormData(e.currentTarget);
    const neighbourhoodId = String(data.get('neighbourhoodId') ?? '');
    const landmarkText = String(data.get('landmarkText') ?? '').trim();
    const propertyType = String(data.get('propertyType') ?? '');
    const furnished = String(data.get('furnished') ?? '');
    const bedrooms = Number(data.get('bedrooms') ?? NaN);
    const bathrooms = Number(data.get('bathrooms') ?? NaN);
    const monthlyRent = rent;
    const depositAmount = deposit;
    const requiredMonthsUpfront = Number(data.get('requiredMonthsUpfront') ?? NaN);
    const descriptionText = String(data.get('descriptionText') ?? '').trim();
    const streetAddress = String(data.get('streetAddress') ?? '').trim();

    // The reference carried the same pre-flight checks, in the same words.
    // None of them decides whether the listing may PUBLISH - that stays
    // server-side, behind the four gates.
    if (!neighbourhoodId) {
      setError({ message: 'Choose the neighbourhood the property is in.' });
      return;
    }
    if (landmarkText.length < 4) {
      setError({
        message:
          'Give us a landmark - how you would tell a driver where to turn off.',
      });
      return;
    }
    if (!Number.isInteger(bedrooms) || !Number.isInteger(bathrooms)) {
      setError({ message: 'Enter the number of bedrooms and bathrooms.' });
      return;
    }
    if (!/^[0-9]+$/.test(monthlyRent) || monthlyRent === '0') {
      setError({ message: 'Enter the monthly rent in shillings.' });
      return;
    }
    if (!/^[0-9]+$/.test(depositAmount)) {
      setError({ message: 'Enter the deposit in shillings (0 if there is none).' });
      return;
    }
    if (!Number.isInteger(requiredMonthsUpfront) || requiredMonthsUpfront < 1) {
      setError({ message: 'How many months are payable upfront? At least one.' });
      return;
    }

    setPending(true);
    try {
      const res = await postJson<{ listingId: string; propertyId: string }>(
        '/landlord/properties',
        {
          propertyType,
          bedrooms,
          bathrooms,
          furnished,
          neighbourhoodId,
          landmarkText,
          ...(streetAddress ? { streetAddress } : {}),
          // Integer shillings as STRINGS on the wire (API Spec §2).
          monthlyRent,
          depositAmount,
          requiredMonthsUpfront,
          ...(descriptionText ? { descriptionText } : {}),
        },
      );
      // "Save and continue": the reference forwarded to the new listing,
      // where the next steps (agreement, publish) are waiting.
      router.push(`/landlord/listings/${res.listingId}?created=1`);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach House For Rent. Nothing was saved - try again in a moment.',
        });
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="stack-lg">
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}

      <section className="card stack">
        <h2 className="h3">Where it is</h2>

        <div className="field">
          <label className="label" htmlFor="neighbourhoodId">
            Neighbourhood
          </label>
          <select
            id="neighbourhoodId"
            name="neighbourhoodId"
            className="select"
            required
            defaultValue=""
          >
            <option value="" disabled>
              Choose a neighbourhood…
            </option>
            {neighbourhoods.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
                {n.parentName ? ` - ${n.parentName}` : ''}
              </option>
            ))}
          </select>
          <p className="hint">
            {/* Honest about the corridor rather than letting someone submit
                into an area no officer can reach. */}
            Only areas our field officers currently cover are listed. If yours
            is missing, we are not yet operating there.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor="landmarkText">
            Landmark
          </label>
          <input
            id="landmarkText"
            name="landmarkText"
            className="input"
            required
            minLength={4}
            maxLength={160}
            placeholder="Behind the Shell station on Kiwatule Road"
          />
          <p className="hint">
            How you would tell a driver where to turn off. This is what tenants
            and our officer will use.
          </p>
        </div>

        <div className="field">
          <label className="label" htmlFor="streetAddress">
            Street address <span className="faint">(optional)</span>
          </label>
          <input
            id="streetAddress"
            name="streetAddress"
            className="input"
            maxLength={160}
          />
          <p className="hint">
            Never required. Plenty of properties here do not usefully have one.
          </p>
        </div>
      </section>

      <section className="card stack">
        <h2 className="h3">The property</h2>

        <div className="field">
          <label className="label" htmlFor="propertyType">
            Type
          </label>
          <select
            id="propertyType"
            name="propertyType"
            className="select"
            required
            defaultValue="apartment"
          >
            <option value="apartment">Apartment</option>
            <option value="house">House</option>
            <option value="room">Single room</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="row" style={{ gap: '1rem', alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: '1 1 8rem', margin: 0 }}>
            <label className="label" htmlFor="bedrooms">
              Bedrooms
            </label>
            <input
              id="bedrooms"
              name="bedrooms"
              type="number"
              className="input"
              required
              min={0}
              max={20}
              defaultValue={2}
            />
          </div>
          <div className="field" style={{ flex: '1 1 8rem', margin: 0 }}>
            <label className="label" htmlFor="bathrooms">
              Bathrooms
            </label>
            <input
              id="bathrooms"
              name="bathrooms"
              type="number"
              className="input"
              required
              min={0}
              max={20}
              defaultValue={1}
            />
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="furnished">
            Furnishing
          </label>
          <select
            id="furnished"
            name="furnished"
            className="select"
            required
            defaultValue="unfurnished"
          >
            <option value="furnished">Furnished</option>
            <option value="semi_furnished">Part furnished</option>
            <option value="unfurnished">Unfurnished</option>
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="descriptionText">
            Description <span className="faint">(optional)</span>
          </label>
          <textarea
            id="descriptionText"
            name="descriptionText"
            className="textarea"
            maxLength={1200}
            placeholder="What a tenant should know: the water situation, the compound, how quiet it is, what is included."
          />
        </div>
      </section>

      <section className="card stack">
        <h2 className="h3">Your terms</h2>

        <div className="field">
          <label className="label" htmlFor="monthlyRent">
            Monthly rent (UGX)
          </label>
          <input
            id="monthlyRent"
            name="monthlyRent"
            className="input num"
            inputMode="numeric"
            required
            value={group(rent)}
            onChange={(e) => setRent(digits(e.target.value))}
            placeholder="1,400,000"
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="depositAmount">
            Deposit (UGX)
          </label>
          <input
            id="depositAmount"
            name="depositAmount"
            className="input num"
            inputMode="numeric"
            required
            value={group(deposit)}
            onChange={(e) => setDeposit(digits(e.target.value))}
            placeholder="1,400,000"
          />
          <p className="hint">Enter 0 if you are not asking for one.</p>
        </div>

        <div className="field">
          <label className="label" htmlFor="requiredMonthsUpfront">
            Months payable upfront
          </label>
          <input
            id="requiredMonthsUpfront"
            name="requiredMonthsUpfront"
            type="number"
            className="input"
            required
            min={1}
            max={24}
            defaultValue={3}
          />
          <p className="hint">
            {/* The client does not add these up. The total a tenant is asked
                for is derived server-side from these terms (F-012), and is
                shown on the listing once it is created. */}
            The tenant funds this into escrow with us. We hold it until they
            confirm they have moved in.
          </p>
        </div>
      </section>

      <button
        type="submit"
        className="btn btn-primary btn-lg btn-block"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save and continue'}
      </button>

      <p className="hint">
        Saving does not publish anything. You will see the next steps, and
        nothing is charged at any point before a tenant moves in.
      </p>
    </form>
  );
}
