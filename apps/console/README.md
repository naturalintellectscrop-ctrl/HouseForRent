# House For Rent — FOO / Admin Console

The internal Field Operations Officer console (Technical Architecture §7 —
**web, not mobile, for V1**: an internal ops tool where clarity, form density
and speed beat native polish).

## What it is

A **thin client**. Technical Architecture §7: *"all money, state,
verification, and commission logic is server-side … It renders server state
and issues intent."*

Nothing here computes a commission, decides whether a viewing may be
conducted, or judges whether a listing is stale. Every rule lives in
`../backend` and is enforced by the guards and services of Stages 0–7. Where
this app appears to know a rule — the disabled **Close visit** button — it is
rendering `canConduct` as the *server* reported it, not deciding for itself.
A rule re-implemented here would be a second copy free to drift, and a copy
an attacker can rewrite.

## What it covers (Stage 7 slice)

- Sign in / sign out, staff-only
- Dispatch board — the officer's own assigned visits (FR-5.2)
- The field visit: structured report (FR-5.4), media capture (FR-5.5),
  close-visit / no-show (FR-5.3, FR-5.2)
- Introduction records as queryable circumvention evidence (FR-5.3, FR-8.3)

Admin observability (reconciliation, launch gate, verification queue) is
**not** here — those endpoints are Stage 8 and do not exist yet.

## Deliberate choices

- **No component library, no web fonts, no Tailwind.** FR-5.5 and NFR-5
  require this to work on a phone browser on a weak connection. Nearly every
  page is a server component shipping no interactive JS; `app/globals.css` is
  a few kilobytes, cached after first load.
- **Tokens live in `httpOnly` cookies** and are attached server-side, so they
  never enter the client bundle. An XSS here cannot exfiltrate a field
  officer's session.
- **Backend error codes are shown, not paraphrased.** `FIELD_REPORT_REQUIRED`
  and `NOT_ASSIGNED_FOO` mean different things to whoever an officer rings
  for help; "something went wrong" destroys the only diagnostic they have.

## Running

```
cp .env.example .env.local     # points at the backend, default :3000
npm install
npm run dev                    # http://localhost:3000 by default
```

See `e2e/README.md` for the browser tests.
