# House For Rent — web

The House For Rent website: the public marketplace, the tenant and landlord
portals, and the operations console, in one Next.js application.

> Repository-wide orientation lives in [`../../CLAUDE.md`](../../CLAUDE.md).
> This file covers what is specific to this workspace.

## What it is

A **thin client**. Technical Architecture §7: *"all money, state,
verification, and commission logic is server-side … It renders server state
and issues intent."*

Nothing here computes a commission, decides whether a viewing may be
conducted, judges whether a listing is stale, or maps a deal status to the
actions available on it. Every rule lives in `../api` and is enforced by its
guards and services. A rule re-implemented here would be a second copy free
to drift — and a copy an attacker can rewrite.

Concretely, this app contains:

- **no arithmetic on money.** `expectedUpfront`, `commissionIfLet` and every
  ledger figure arrive computed. `lib/money.ts` formats; it does not add.
- **no status → action map.** `availableActions` arrives from the server on
  every deal read. The one status table here (`DEAL_TRAIL` in
  `lib/portal.ts`) is a display ORDER for a progress bar, never consulted to
  decide whether something is permitted.
- **no authorisation.** `requireRole()` reads a cookie the browser can
  rewrite. It picks which links render and spares people a confusing 403;
  the API refuses regardless (NFR-1).

## Layout

```
app/
  (site)/        public marketplace — no account required
  (portal)/      /account (tenant) and /landlord (lister)
    landlord/layout.tsx   narrows the shared shell to listers
    account/layout.tsx    narrows it to tenants
    deal-view.tsx         one deal, rendered for either party
  ops/           the operations console (foo + admin)
  actions/       server actions — thin forwards, and the only writers
  login/ register/
  ui.tsx         shared components, icons, money and date formatting
  globals.css    the entire design system, hand-written
lib/
  api.ts         SERVER-ONLY transport. Reads the session cookie.
  contract.ts    types + mediaUrl. Safe in the client bundle.
  portal.ts      portal shapes and per-status copy
  money.ts       BigInt shillings — parsing and formatting only
  session.ts     cookie handling and the convenience role gates
e2e/             Playwright: the journeys, and the phone layout
```

### `api.ts` vs `contract.ts`

`api.ts` imports `next/headers`, which makes it **server-only**. A client
component importing a mere TYPE from it drags the whole module — and the API
base URL — into the browser bundle. Types and pure functions therefore live
in `contract.ts`; anything that talks to the network lives in `api.ts`,
which re-exports the contract for server-side convenience.

## Session handling

Tokens are in `httpOnly` cookies the browser cannot script-read, and are
attached to backend calls **server-side**, so they never enter the client
bundle. A non-httpOnly `hfr_role` cookie exists solely to decide which links
render; the server re-reads the real role from the database on every
request, so rewriting it changes the menu and nothing else.

## Running it

```bash
# from the repository root, with the API already running on :3000
npm run web          # http://localhost:3100
```

`API_BASE_URL` (server-side, **not** `NEXT_PUBLIC_`) points at the API.
`NEXT_PUBLIC_MEDIA_BASE` is the one deliberately-public variable: an
`<img src>` has to resolve in the browser.

## Tests

```bash
npx playwright test                      # desktop 1440 + phone 412
npx playwright test --project=phone      # the narrow layout only
node scripts/shoot.mjs http://localhost:3100 ./shots   # screenshots
```

The specs create their accounts through the registration form and touch no
database. A test that reaches past the API to obtain a state a real visitor
could not reach proves nothing about the product — see `../../CLAUDE.md` §7.
