# Stitch design reference packs

Four packs of generated screens, each with a `screen.png` and the `code.html`
that produced it. They arrived as `stitch_house_for_rent_stitch_pack`,
`... (1)`, `... (2)` and `... (3)`; they are renamed here for what they
actually contain and flattened out of their duplicated inner directory.

| Folder | Contents | Status |
|---|---|---|
| `01-tenant-discovery` | search, property details, filters, empty state, viewings, request-a-viewing, identity verification, welcome | **Implemented** |
| `02-booking-and-escrow` | payment summary, funds protected, confirm move-in, receipt, landlord onboarding, mandate, verification status | **Partly implemented** |
| `03-landlord` | dashboard, listings, listing wizard, portfolio analytics, messaging | **Partly implemented** |
| `04-azure-not-implemented` | login, create account, favorites, welcome | **Not implemented** |

## The design system

Two are defined, and only one is built:

- **`ugandan_rental_essence/DESIGN.md`** (packs 01–03) — forest green
  `#0a5514`, warm off-white `#fcf8f8`, Hanken Grotesk, red reserved
  exclusively for errors. This is the implemented system. Its primary is
  byte-identical to the green measured out of the logo, so it was drawn for
  this brand rather than adapted to it. See `mobile/lib/theme.ts`.

- **`azure_property_design_system/DESIGN.md`** (pack 04) — `#0053ce` blue,
  Plus Jakarta Sans, "high-end lifestyle audience". Not implemented. Blue
  is not this company's colour, and the screens drawn in it are a re-skin of
  a generic real-estate template: one is still captioned "Welcome to Real
  Scout" and offers Google sign-in, which this product cannot use because
  accounts are keyed to a Ugandan MSISDN and NIN.

## What was deliberately not built

Several screens assert things the system does not do. They are listed here
so nobody implements them from the picture later:

- **"Your funds are protected under the Housing Escrow Act"**
  (`02/payment_summary`) — no such statute is cited anywhere in this
  project; the PRD frames escrow as a Bank of Uganda–licensed PSP.
- **"Your listing will go live immediately after verification"**
  (`03/review_publish`) — the publish gate enforces four preconditions:
  verified, in-corridor, mandate, listing agreement accepted.
- **"A Field Officer will visit your property within 24 hours"** — no SLA
  enforces this; dispatch is corridor-bounded and admin-assigned.
- **Revenue, occupancy, lease-expiry, NPS and star ratings**
  (`03/portfolio_analytics*`) — no table holds any of it. The "refined"
  variant adds more of it, not less.
- **Messaging** (`03/chat`, `inquiries`, `messages`) — no backend, and
  direct landlord↔tenant contact is the circumvention that introduction
  records and the circumvention clause exist to evidence (FR-8.3, FR-9.1).
- **Favourites / "Saved" tab, reschedule, profile avatars** — no backend.

## The photography

Every property image in these packs is a generated render hot-linked from
`lh3.googleusercontent.com`. Those URLs expire. Nine of them are bundled
into the app for the welcome collage only — see
`mobile/assets/welcome/README.md`. Everywhere else the app renders an honest
empty frame until a field officer's capture exists.
