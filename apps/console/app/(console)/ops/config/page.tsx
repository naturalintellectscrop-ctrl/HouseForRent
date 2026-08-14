import { redirect } from 'next/navigation';
import { api, ApiError, type ConfigVersion } from '@/lib/api';
import { AdminOnly, Empty, when } from '../../../ui';
import { ConfigVersionForm, RateVersionForm } from './version-forms';

/**
 * FR-10.1 — configuration management.
 *
 * The V1 parameter keys. Listed here only to populate a dropdown; the
 * server owns which keys exist and rejects an unknown one. A free-text
 * field would let a typo create a parameter nobody reads.
 */
const CONFIG_KEYS = [
  'service_area',
  'freshness_window_days',
  'screening_modules',
  'launch_gate_count',
  'required_months_default',
];

export default async function ConfigPage(props: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await props.searchParams;
  const selected = key && CONFIG_KEYS.includes(key) ? key : CONFIG_KEYS[1];

  let versions: ConfigVersion[];
  try {
    versions = await api<ConfigVersion[]>(
      `/v1/admin/config/${encodeURIComponent(selected)}/versions`,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="Configuration" />;
      // A parameter that has never been defined has no history yet — not an
      // error, and not a reason to fail the whole page.
      if (err.status === 404 || err.status === 422) {
        versions = [];
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const now = Date.now();

  return (
    <>
      <h1>Configuration</h1>
      <p className="lede">
        Every parameter here is versioned and effective-dated. A change
        creates a new version; nothing is ever edited in place, so the
        history of what was in force when stays readable.
      </p>

      <h2>Commission rate</h2>
      <RateVersionForm />

      <h2>Parameters</h2>
      <ConfigVersionForm keys={CONFIG_KEYS} />

      <h2>History — {selected}</h2>
      <form method="get" className="filter-form">
        <label htmlFor="history-key">Show history for</label>
        <select id="history-key" name="key" defaultValue={selected}>
          {CONFIG_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          Show
        </button>
      </form>

      {versions.length === 0 ? (
        <Empty title={`No versions recorded for ${selected}.`}>
          Nothing reads this parameter successfully until a first version
          exists: reading an unset parameter throws rather than defaulting,
          because a silent fallback is how an unvalidated business value
          becomes permanent without anyone deciding it. Set the first version
          under <strong>Parameters</strong> above.
        </Empty>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Value</th>
                <th scope="col">Effective from</th>
                <th scope="col">State</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version, index) => {
                const effective = new Date(version.effectiveFrom).getTime();
                const future = effective > now;
                // The version in force is the newest one whose date has
                // passed. Rows arrive newest-first.
                const inForce =
                  !future &&
                  versions
                    .slice(0, index)
                    .every((v) => new Date(v.effectiveFrom).getTime() > now);

                return (
                  <tr key={version.id}>
                    <td className="mono">{JSON.stringify(version.value)}</td>
                    <td>{when(version.effectiveFrom)}</td>
                    <td>
                      {future ? (
                        <span className="pill pill-warn">scheduled</span>
                      ) : inForce ? (
                        <span className="pill pill-ok">in force</span>
                      ) : (
                        <span className="pill">superseded</span>
                      )}
                    </td>
                    <td>{when(version.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="muted">
        A <span className="pill pill-warn">scheduled</span> version is
        invisible to the rest of the system until its date arrives, so a
        change can be staged in advance without taking effect early.
      </p>
    </>
  );
}
