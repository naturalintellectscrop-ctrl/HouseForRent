'use client';

import { useActionState, useState } from 'react';
import { createPropertyAction } from '@/app/actions/landlord';
import { IDLE, type ActionState } from '@/app/actions/state';
import type { Neighbourhood } from '@/lib/contract';
import { ApiAlert } from '@/app/ui';

/** Groups shillings for display only. The submitted value is stripped clean. */
function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function PropertyForm({
  neighbourhoods,
}: {
  neighbourhoods: Neighbourhood[];
}) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    createPropertyAction,
    IDLE,
  );

  /**
   * ── Why the money fields are controlled ──
   * A landlord typing 1400000 cannot see at a glance whether that is 1.4m or
   * 14m, and a mistyped rent is the figure a tenant will be asked to fund.
   * Grouping as they type is the cheapest possible guard against a
   * factor-of-ten error, and it costs one piece of state.
   *
   * The value SUBMITTED is the raw digits — the server takes a string of
   * integer shillings and would reject the grouped form.
   */
  const [rent, setRent] = useState('');
  const [deposit, setDeposit] = useState('');

  const digits = (v: string) => v.replace(/[^0-9]/g, '');

  return (
    <form action={submit} className="stack-lg">
      {state.error ? <ApiAlert message={state.error} code={state.code} /> : null}

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
                {n.parentName ? ` — ${n.parentName}` : ''}
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
