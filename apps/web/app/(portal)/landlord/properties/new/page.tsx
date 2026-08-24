import Link from 'next/link';
import { apiGet, type Neighbourhood } from '@/lib/api';
import { Icon } from '@/app/ui';
import { PropertyForm } from './property-form';

export const metadata = { title: 'Add a property' };

/**
 * Adding a property (F-003, and the reason F-015 had to be fixed first).
 *
 * ── The neighbourhood picker is why the taxonomy routes exist ──
 * `POST /v1/properties` requires a `neighbourhoodId`, and until
 * `GET /v1/neighbourhoods` was built there was no way for any client to
 * discover one. That single missing route made this entire page impossible,
 * which is why inventory could only ever enter the system through a seed
 * script.
 *
 * Only in-service-area neighbourhoods are offered. A property outside the
 * corridor can never publish (FR-2.5), so offering one would be setting a
 * landlord up to submit into a void.
 */
export default async function NewPropertyPage() {
  const { neighbourhoods } = await apiGet<{ neighbourhoods: Neighbourhood[] }>(
    '/v1/neighbourhoods',
    { revalidate: 300 },
  );

  // Districts are containers, not places a property sits in. They are
  // recognisable by having no live listings and children beneath them; the
  // simpler signal is that every real neighbourhood in the corridor has a
  // parent.
  const selectable = neighbourhoods.filter((n) => n.parentId !== null);

  return (
    <div className="detail-grid">
      <div className="stack-lg" style={{ maxWidth: '38rem' }}>
        <div className="stack">
          <p>
            <Link href="/landlord" className="btn btn-ghost btn-sm">
              ← Your properties
            </Link>
          </p>
          <h1 className="h1">Add a property</h1>
          <p className="lede">
            Tell us where it is and what you are asking. Nothing publishes until
            one of our officers has visited it and you have accepted the
            agreement — and nothing is charged until a tenant moves in.
          </p>
        </div>

        <PropertyForm neighbourhoods={selectable} />
      </div>

      <aside className="detail-aside stack">
        <div className="card stack-sm">
          <h2 className="h3">What happens next</h2>
          <ol className="trail" style={{ marginTop: '0.5rem' }}>
            <li className="is-now">
              <div>
                <span className="trail-title">You describe the property</span>
                <span className="trail-note">You are here.</span>
              </div>
            </li>
            <li>
              <div>
                <span className="trail-title">A field officer visits</span>
                <span className="trail-note">
                  They photograph it and file a condition report.
                </span>
              </div>
            </li>
            <li>
              <div>
                <span className="trail-title">You accept the agreement</span>
                <span className="trail-note">
                  Commission terms, in writing, before anything is public.
                </span>
              </div>
            </li>
            <li>
              <div>
                <span className="trail-title">It goes live</span>
                <span className="trail-note">
                  Tenants find it and request viewings.
                </span>
              </div>
            </li>
          </ol>
        </div>

        <div className="card stack-sm">
          <h2 className="h3">
            <Icon.pin size={16} /> On addresses
          </h2>
          <p className="muted">
            A street address is optional and we will never require one. We
            describe location by neighbourhood and landmark, because that is how
            people here actually give directions — and it is what our officer
            will use to find you.
          </p>
        </div>
      </aside>
    </div>
  );
}
