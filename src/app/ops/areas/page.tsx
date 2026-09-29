import { redirect } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { AdminOnly } from '@/app/ui';
import { NeighbourhoodCreateForm, ServiceAreaToggle } from './area-controls';

/**
 * The service-area console (admin) — where the platform's physical
 * boundary is set, neighbourhood by neighbourhood.
 *
 * ── What inServiceArea actually controls ──
 * It is read live by three things: the public search filter (out-of-area
 * listings never appear), the publish gate (a listing outside the area
 * cannot go live — the landlord sees "outside the area we currently
 * cover"), and the deal service (an introduction outside it is refused).
 * This page is therefore not a label editor; it is the switch that decides
 * where House For Rent operates. Every move is audited with from/to and
 * how many live listings it affected.
 *
 * Zero-count areas stay visible on purpose: "is my neighbourhood covered
 * yet?" is a real question from landlords, and an honest "recorded, not
 * yet in service" beats an empty map.
 */

interface AreaRow {
  id: string;
  name: string;
  district: string;
  inServiceArea: boolean;
  propertyCount: number;
  liveListingCount: number;
  hasCoordinates: boolean;
}

export default async function AreasPage() {
  let areas: AreaRow[];
  try {
    const res = await api<{ neighbourhoods: AreaRow[] }>('/v1/ops/neighbourhoods');
    areas = res.neighbourhoods;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) redirect('/login');
      if (err.status === 403) return <AdminOnly what="The service-area console" />;
    }
    throw err;
  }

  // Grouped by district in the page (the service returns a flat list —
  // grouping is presentation, not business logic).
  const byDistrict = new Map<string, AreaRow[]>();
  for (const a of areas) {
    const list = byDistrict.get(a.district) ?? [];
    list.push(a);
    byDistrict.set(a.district, list);
  }
  const districts = [...byDistrict.keys()].sort((x, y) => x.localeCompare(y));

  const inService = areas.filter((a) => a.inServiceArea).length;
  const liveListings = areas.reduce((sum, a) => sum + a.liveListingCount, 0);

  return (
    <>
      <h1>Service areas</h1>
      <p className="lede">
        Where House For Rent operates, neighbourhood by neighbourhood. An
        area inside the service boundary is searchable, publishable and open
        to introductions; outside it, none of those are true.{' '}
        {inService} of {areas.length} recorded neighbourhood
        {areas.length === 1 ? '' : 's'} are in service, carrying {liveListings} live{' '}
        {liveListings === 1 ? 'listing' : 'listings'}.
      </p>

      <NeighbourhoodCreateForm districts={districts} />

      {areas.length === 0 ? (
        <p className="notice notice-info" role="status">
          No neighbourhood recorded yet. Add the first one above — search and
          the public areas page read this same table, so an area appears
          there the moment it exists.
        </p>
      ) : (
        districts.map((district) => (
          <section key={district} aria-label={district} style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.05rem', marginBottom: '0.6rem' }}>{district}</h2>
            <div className="table-scroll">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th scope="col">Neighbourhood</th>
                    <th scope="col" className="num">
                      Properties
                    </th>
                    <th scope="col" className="num">
                      Live listings
                    </th>
                    <th scope="col">Standing</th>
                    <th scope="col">Service area</th>
                  </tr>
                </thead>
                <tbody>
                  {byDistrict.get(district)!.map((a) => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600 }}>{a.name}</td>
                      <td className="num">{a.propertyCount}</td>
                      <td className="num">{a.liveListingCount}</td>
                      <td>
                        {a.inServiceArea ? (
                          <span className="badge badge-ok">in service</span>
                        ) : (
                          <span className="badge">outside the area</span>
                        )}
                      </td>
                      <td>
                        <ServiceAreaToggle area={a} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <p className="faint" style={{ fontSize: '0.8125rem' }}>
        The public <a href="/areas">areas page</a> and property search read
        this table live — there is no separate publish step for a boundary
        move. Every change is audited with the previous state and the live
        listings it affected.
      </p>
    </>
  );
}
