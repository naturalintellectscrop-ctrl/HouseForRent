'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * The two controls on the service-area console (Task 13).
 *
 * ── Why both confirm what they are about to change ──
 * `inServiceArea` is read live by public search, the publish gates and the
 * deal service. Switching an area off is not cosmetic: its live listings
 * stop being reachable in search the moment the flag flips, and a landlord
 * there will see "outside the area we currently cover". So the operator
 * reads the consequence, confirms, and the change lands with an audit row
 * carrying from/to and how many live listings it affected.
 */

interface NeighbourhoodRow {
  id: string;
  name: string;
  district: string;
  inServiceArea: boolean;
  propertyCount: number;
  liveListingCount: number;
}

/** Add a neighbourhood. Appears in search and /areas the moment it exists. */
export function NeighbourhoodCreateForm({ districts }: { districts: string[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('');
  const [inService, setInService] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // Existing districts are offered as starting points (they are the real
  // taxonomy); typing a new one is allowed - that is how a new district
  // opens. The dropdown is a suggestion, not a constraint.
  const suggestions = districts.filter((d) => d.toLowerCase() !== district.toLowerCase());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await postJson<{ id: string; name: string }>('/ops/neighbourhoods', {
        name,
        district,
        inServiceArea: inService,
      });
      setCreated(name);
      setName('');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was created - try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ marginBottom: '1.25rem' }}>
      <div className="card-head">
        <span className="card-title">Add a neighbourhood</span>
      </div>
      {created ? (
        <p className="notice notice-ok" role="status">
          {created} added. It is searchable{' '}
          {inService ? 'and live for new listings' : 'as an out-of-area record'} immediately.
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="nb-name">Neighbourhood</label>
        <input
          id="nb-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setCreated(null);
          }}
          placeholder="e.g. Muyenga"
          required
          maxLength={60}
        />
      </div>
      <div className="field">
        <label htmlFor="nb-district">District</label>
        <input
          id="nb-district"
          type="text"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          placeholder="e.g. Kampala"
          required
          maxLength={60}
          list="nb-district-suggestions"
        />
        <datalist id="nb-district-suggestions">
          {suggestions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontWeight: 400 }}>
          <input
            type="checkbox"
            checked={inService}
            onChange={(e) => setInService(e.target.checked)}
            style={{ marginTop: '0.2rem' }}
          />
          <span>
            <strong>In the service area.</strong> Leave unticked to record the
            place without offering it yet - out-of-area neighbourhoods stay
            out of search, cannot publish, and refuse introductions.
          </span>
        </label>
      </div>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      <p style={{ marginTop: '0.75rem' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? 'Adding…' : 'Add neighbourhood'}
        </button>
      </p>
    </form>
  );
}

/** One row's in/out control. Same-value calls are no-ops the server records nothing for. */
export function ServiceAreaToggle({ area }: { area: NeighbourhoodRow }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function submit(to: boolean) {
    setPending(true);
    setError(null);
    try {
      const res = await postJson<{ changed: boolean; inServiceArea: boolean }>(
        `/ops/neighbourhoods/${area.id}/service-area`,
        { inServiceArea: to },
      );
      setNote(
        res.changed
          ? to
            ? 'Back in the service area - search and publishing read it immediately.'
            : 'Out of the service area - dropped from public search with immediate effect.'
          : 'That was already the state - nothing changed.',
      );
      setArmed(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was changed - try again when you have signal.',
        });
      }
    } finally {
      setPending(false);
    }
  }

  if (armed) {
    return (
      <span className="stack-sm" style={{ display: 'inline-flex', maxWidth: '19rem' }}>
        <span style={{ fontSize: '0.8125rem' }}>
          {area.inServiceArea ? (
            <>
              Move <strong>{area.name}</strong> OUT of the service area?{' '}
              {area.liveListingCount > 0 ? (
                <>
                  Its {area.liveListingCount} live listing
                  {area.liveListingCount === 1 ? '' : 's'} leave public search
                  immediately and cannot re-publish while it stays out.
                </>
              ) : (
                'It has no live listings, so nothing leaves search.'
              )}
            </>
          ) : (
            <>
              Move <strong>{area.name}</strong> INTO the service area? Its
              properties become publishable and searchable - verification
              still gates each listing.
            </>
          )}
        </span>
        <span className="row" style={{ gap: '0.4rem' }}>
          <button
            type="button"
            className={area.inServiceArea ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary'}
            onClick={() => submit(!area.inServiceArea)}
            disabled={pending}
          >
            {pending ? 'Moving…' : 'Confirm'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setArmed(false)}
            disabled={pending}
          >
            Back
          </button>
        </span>
        {error ? <ApiAlert message={error.message} code={error.code} /> : null}
      </span>
    );
  }

  return (
    <span className="stack-sm" style={{ display: 'inline-flex' }}>
      <button
        type="button"
        className={area.inServiceArea ? 'btn btn-sm' : 'btn btn-sm btn-primary'}
        onClick={() => setArmed(true)}
      >
        {area.inServiceArea ? 'Move out of service area' : 'Bring into service area'}
      </button>
      {note ? (
        <span className="faint" style={{ fontSize: '0.8125rem' }}>
          {note}
        </span>
      ) : null}
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </span>
  );
}
