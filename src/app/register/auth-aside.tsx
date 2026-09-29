import { Icon } from '@/app/ui';

/**
 * The panel beside the sign-in and registration forms.
 *
 * It carries the four things a person actually wants to know before handing
 * over a phone number, and every one of them is something this system
 * enforces rather than a slogan. It is hidden below 62rem: on a phone the
 * form is the whole job, and a decorative column above it is just something
 * to scroll past.
 */
export function AuthAside() {
  return (
    <aside className="auth-aside">
      <div className="stack">
        <p className="eyebrow">House For Rent</p>
        <h2 className="h1" style={{ maxWidth: '16ch' }}>
          Every home here has been visited by someone who works for us.
        </h2>
      </div>

      <ul className="trust-list" style={{ gap: '1rem', fontSize: '1rem' }}>
        <li>
          <Icon.shield size={18} />
          <span>
            A field officer visits and photographs every property before it is
            published.
          </span>
        </li>
        <li>
          <Icon.clock size={18} />
          <span>
            Availability carries a date. Stale listings leave search instead of
            wasting your trip.
          </span>
        </li>
        <li>
          <Icon.lock size={18} />
          <span>
            Rent and deposit are held in escrow and released to the landlord
            only after move-in.
          </span>
        </li>
        <li>
          <Icon.key size={18} />
          <span>
            Free for tenants. The landlord pays one commission, once, on a
            completed move-in.
          </span>
        </li>
      </ul>

      <p className="muted" style={{ fontSize: '0.875rem' }}>
        Operated by Natural Intellects Ltd, Kampala.
      </p>
    </aside>
  );
}
