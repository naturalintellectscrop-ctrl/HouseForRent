# House For Rent

A trust-first residential rental marketplace for Kampala, operated by
Natural Intellects Ltd.

This file is the **single orientation document** for anyone — human or
agent — working in this repository. It consolidates what is spread across
`docs/`, and it is the one to read first. Where it summarises, the linked
document remains authoritative.

| Document | Authoritative for |
|---|---|
| [`docs/House_For_Rent_Business_Discovery_Summary.md`](docs/House_For_Rent_Business_Discovery_Summary.md) | The 11 frozen business decisions (the SSOT) |
| [`docs/House_For_Rent_PRD.md`](docs/House_For_Rent_PRD.md) | Functional requirements (`FR-x.y`), NFRs |
| [`docs/House_For_Rent_Technical_Architecture.md`](docs/House_For_Rent_Technical_Architecture.md) | Module decomposition, client architecture |
| [`docs/House_For_Rent_Data_Model.md`](docs/House_For_Rent_Data_Model.md) | Tables, the immutable set, the state machine |
| [`docs/House_For_Rent_API_Specification.md`](docs/House_For_Rent_API_Specification.md) | Endpoints, the authorisation matrix, amendments |
| [`docs/DOMAIN.md`](docs/DOMAIN.md) | Stage-by-stage implementation log and its decisions |
| [`docs/AUTHENTICATION.md`](docs/AUTHENTICATION.md) | The auth implementation in detail |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | How to deploy, and how to verify a deployment |
| [`HOUSE_FOR_RENT_ENGINEERING_FINDINGS.md`](HOUSE_FOR_RENT_ENGINEERING_FINDINGS.md) | Every defect found, its status, and its evidence |

---

## 1. What the product is

Renting in Kampala asks a tenant to hand several months of income to someone
they have met once, for a property they may have seen once. Listings go
stale within days and nobody updates them; a tenant travels across town to a
home that was let a fortnight ago, or that never existed.

The usual answer is a better search interface. That does not help — the data
underneath is wrong, and a faster route to wrong data is not an improvement.

**So House For Rent sends a person.** A Field Operations Officer visits every
property before it is published, photographs it, files a structured condition
report, and confirms with the landlord that it is genuinely available.
Nothing appears in search without that visit. Availability then carries a
date; when a confirmation goes stale, the listing leaves search rather than
quietly becoming a wasted trip.

**And House For Rent holds the money.** Rent and deposit sit in escrow until
the tenant confirms they have moved in. Only then is the landlord paid and
the commission taken. Both parties are exposed to the platform rather than to
each other, which is a much smaller thing to ask.

This does not scale the way a listings database does. Every property cost an
officer a journey, which is why the service operates in a defined corridor
rather than claiming national coverage. **A short list somebody stood inside
is the product.**

---

## 2. The business model — 11 frozen decisions

These are frozen. Changing any of them is a **business** decision, not an
engineering one, and must be recorded as a dated amendment in the SSOT's
amendment log. Do not silently diverge from one.

| # | Decision | What it means in code |
|---|---|---|
| 1 | Mid-market residential beachhead | `transaction_type` is a single-value enum (`rental`); the seam for sales exists and is unbuilt |
| 2 | One contiguous launch corridor + a liquidity gate | `neighbourhood.in_service_area`; the launch gate on the admin dashboard |
| 3 | **The landlord pays. Tenants pay nothing, ever** | `freeForTenants: true` on every search result; no tenant-facing charge exists anywhere |
| 4 | Configurable success commission | `commission_rate_version`, effective-dated |
| 5 | Commission base is **one month**, not the advance | `rate_bp_of_month` × `monthly_rent_at_signing` |
| 6 | Rentals only in V1 | See 1 |
| 7 | Escrow, with an external licensed PSP as custodian | Double-entry ledger + `PaymentProvider`; **House For Rent never holds client funds** |
| 8 | Brokers participate, under verification tiers | `lister_profile.tier`, `property_mandate` |
| 9 | **Company-conducted viewings** via the FOO | `viewing`, `field_report`, `introduction_record` |
| 10 | Identity-only screening; ability to pay is evidenced by escrow | No payslips, no bank statements — a DPA liability with no matching benefit |
| 11 | Circumvention clause, backed by introduction evidence | `listing_agreement.circumvention_clause_version` + the timestamped introduction record |

### The invariants that follow

These are the rules the system exists to enforce. Breaking one is a defect
regardless of what a test says.

1. **No money endpoint trusts a caller-supplied amount.** Funding derives
   the upfront total from the deal's own signed terms; settlement and refund
   derive the outstanding escrow liability from the ledger, inside the
   transaction, under a row lock.
2. **Commission is snapshot-derived.** The rate version and the rent are
   frozen onto the deal at `sign-agreement` and never move. A later rate
   change cannot alter an agreement already signed.
3. **Move-in is the earning event.** Escrow is released after the tenant
   confirms move-in, not before. No move-in, no commission, full refund.
4. **Ledger postings balance, and money operations are atomic.** The ledger
   posting and the status change commit in one transaction or neither does.
5. **A listing goes live only if** it is field-verified, in the service
   corridor, covered by an accepted agreement, and (for brokers) mandated.
6. **A tenant must be identity-verified before requesting a viewing**, and a
   viewing cannot be conducted without both a field report and an
   introduction record.
7. **Nine tables are append-only at the database level**, by trigger — not
   by convention. Corrections are new rows.
8. **The server decides what a caller may do.** `availableActions` on a deal
   is derived from the real transition graph and the real `@Roles()`
   decorators. No client holds a copy.

---

## 3. Architecture

```
                    HOUSE FOR RENT WEB  (apps/web — Next.js 16)
                                │
          ┌─────────────────────┼─────────────────────┐
          │                     │                     │
    PUBLIC MARKETPLACE    USER PORTALS           OPS CONSOLE
    /                     /account   (tenant)    /ops
    /properties           /landlord  (lister)    /ops/dispatch
    /properties/[id]                             /ops/deals
    /how-it-works                                /ops/viewings
    /for-landlords                               /ops/queue
    /about  /contact                             /ops/audit
    /login  /register                            /ops/config
          └─────────────────────┼─────────────────────┘
                                │  HTTPS / REST, role-scoped
                    NestJS API  (apps/api)
                                │
                    Prisma  →  PostgreSQL
```

**One web client, deliberately.** The original architecture specified two
mobile apps and a staff console; an Expo client was built and has been
**removed**. A landlord being shown this product for the first time will be
shown it on a laptop; a listing that cannot be opened from a link is
invisible to how people actually find homes here; and an officer works from a
phone browser with nothing to install. The mobile client also carried its own
copy of the deal state machine (F-013), which a thin client rendering
server-provided actions cannot do.

**Modular monolith, not microservices.** Any operation touching money or a
state transition runs in one PostgreSQL transaction spanning the ledger
posting and the status change. There is no eventual consistency between a
deal's status and its ledger effect, and that is the primary reason for the
monolith.

### Repository layout

```
apps/
  api/                      NestJS + Prisma + PostgreSQL
    prisma/                 schema.prisma + 10 migrations
    src/
      auth/                 JWT, guards, roles, Better Auth (mounted, inert)
      identity/             verification, consent, mandates
      screening/            onboarding pipeline + the identity controller
      listings/             properties, listings, the publish gate
      taxonomy/             neighbourhoods, amenities        (F-015)
      photos/               listing photography + byte serving
      search/               the public feed
      viewings/             field ops, reports, introductions
      deals/                the state machine, commission, deal actions
      ledger/               double-entry, escrow
      payments/             PSP abstraction (mock in V1)
      agreements/           listing agreements, circumvention clause
      admin/                queues, reconciliation, config, audit reads
      audit/  config/  media/  common/  prisma/
    scripts/
      seed-web-demo.mjs     the demo corridor
      fixture-image.mjs     generated placeholder artwork
      journey-http.mjs      the whole journey over HTTP — see §7
  web/                      Next.js 16, App Router
    app/
      (site)/               public marketplace
      (portal)/             /account (tenant) + /landlord (lister)
      ops/                  operations console
      actions/              server actions — thin forwards to the API
      ui.tsx                shared components, icons, formatting
      globals.css           the whole design system
    lib/
      api.ts                server-only transport (reads the session cookie)
      contract.ts           types + mediaUrl — safe for the client bundle
      portal.ts             portal shapes and status copy
      money.ts              BigInt shillings, formatting only
    e2e/                    Playwright: journey + responsive
docs/                       the specification set
```

---

## 4. The domain in one pass

### Roles

`tenant` · `lister` (landlord/broker) · `foo` (Field Operations Officer) ·
`admin`. One primary role per account. Only `tenant` and `lister` are
self-served; staff are provisioned by an admin through `POST /v1/auth/staff`.

### The listing lifecycle

```
landlord creates property + listing terms
   → accepts the listing agreement          (commission rate snapshotted)
   → FOO visits, verifies, confirms availability
   → publish                                 (4 gates, all server-side)
   → live in search
```

Publishing requires **all four**: `verification_state = 'verified'`, the
neighbourhood in the service area, an accepted agreement, and — for
broker/management listers — a verified per-property mandate.

### The deal state machine

```
created → tenant_matched → agreement_signed → escrow_funded
        → move_in_confirmed → commission_earned → settled → closed
```

with `cancelled`, `refunded` and `disputed` reachable from the appropriate
points. `sign-agreement` is the snapshot point: rent and commission rate are
frozen there, forever.

A client never maps a status to an action. `GET /v1/deals/:id` returns
`availableActions`, each with a label, a plain-language consequence, whether
it moves money, whether it is reversible, and the fields it needs.

### Provenance of a photograph

`field_officer` · `lister` · `development_fixture`. Written from the
**caller's role**, never from a request body — "our officer stood in that
room" is the claim the business sells, and a lister has every incentive to
make it falsely. `development_fixture` is reachable from no HTTP route.

---

## 5. Working in this repository

### Conventions that are load-bearing

- **Money is `BigInt` in the domain and a STRING on the wire.** It never
  passes through a JS number. `Number('4200000')` is harmless; a year of rent
  across a portfolio is not, and 2^53 arrives sooner in shillings than
  anyone expects. Group for display with a regex on the string.
- **DTOs are allowlists.** The global `ValidationPipe` runs with
  `forbidNonWhitelisted`, so an unexpected field is a 400, not a silently
  ignored value. Note what DTOs deliberately *omit*: no `partyId`, no
  `status`, no `commissionAmount`, no `source`.
- **Identity comes from the session, never the body.** Every endpoint that
  acts on behalf of someone reads the party from the JWT.
- **Ownership is not role membership.** Holding `lister` is not being *this*
  listing's landlord. See F-016 for what happened when those were conflated.
- **404, not 403, for non-parties.** A 403 confirms the resource exists,
  which is how an unpublished address becomes discoverable by probing.
- **Audit events name a resolved actor.** An audit row naming an actor the
  client chose proves nothing.
- **The web client computes no business value.** No commission, no totals,
  no authorisation, no state machine. If a screen needs something the API
  cannot safely provide, widen the API contract — do not compute it in the
  browser.

### The design system

`apps/web/app/globals.css` is hand-written and is the whole of it. No
component library, no web fonts.

- **Colour.** Near-black ink `#0e1412`, brand green `#16a34a` for marks, and
  `#15803d` for button fills — white on `#16a34a` measures 3.29:1 and fails
  AA, and the primary button in this product moves money. Dark mode is a
  real counterpart with re-derived values, not an inversion.
- **Two registers, one system.** The marketplace breathes; the ops console
  is dense, because an officer in a stairwell wants rows and fields rather
  than whitespace. They share every token.
- **A badge always carries a word.** A bare coloured dot is meaningless to
  anyone who cannot distinguish the hues.
- **The honest empty frame.** A listing with no photograph renders a marked
  empty field saying so. It does **not** fall back to stock imagery — the
  platform's entire claim is that the picture was taken in that room by our
  officer.
- **Mobile-first.** Base rules assume a phone; media queries only widen. The
  small-screen menu is a `<details>` element, so it works before any
  JavaScript loads.

### Honesty rules

The product sells verification. It therefore cannot overstate its own.

- The identity provider is a **mock**, and the page that calls it says so.
- Seeded photographs are **generated artwork**, marked
  `development_fixture` by the API and labelled on the image itself.
- The PSP is a **mock**. The ledger still behaves correctly.
- No invented statistics, no fabricated testimonials, no logo walls. Every
  number on the marketing pages is one the API returned.
- `/contact` has no form, because there is no enquiry endpoint. A form that
  posts nowhere is worse than no form.

---

## 6. Running it

```bash
npm ci

cd apps/api
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
npx prisma migrate deploy
npx prisma generate
DEMO_PASSWORD=choose-something node scripts/seed-web-demo.mjs

# from the repository root, two terminals:
npm run api        # http://localhost:3000
npm run web        # http://localhost:3100
```

Open **http://localhost:3100**.

| Script | Does |
|---|---|
| `npm run api` | API in watch mode |
| `npm run web` | Web app in dev mode |
| `npm run web:build` | Production build of the web app |
| `npm run typecheck` | Both workspaces |
| `npm run test` | API Jest suite |
| `npm run web:e2e` | Playwright, desktop + phone |
| `npm run seed:demo` | The demo corridor (needs `DEMO_PASSWORD`) |
| `npm run migrate` | `prisma migrate deploy` |

**Demo accounts** (password = whatever `DEMO_PASSWORD` was):
`+256700100001` landlord · `+256700100010` tenant (verified) ·
`+256700100020` field officer · `+256700100030` admin.

> **Never commit a password.** `seed-web-demo.mjs` refuses to run without
> `DEMO_PASSWORD` for exactly this reason (F-009) — these accounts include
> an admin who can move money.

---

## 7. How this codebase gets verified

**The rule: a test that reaches past the API to obtain a state no client
could obtain proves nothing about the product.**

Four separate defects (F-001, F-002, F-007, F-017) survived a fully green
test suite because the tests granted themselves database states no user
could reach. In each case the service was complete, the unit tests passed,
and the feature was unreachable by any real person.

So the load-bearing check is:

```bash
cd apps/api
DEMO_PASSWORD=… node scripts/journey-http.mjs
```

It holds **no database connection**. It registers a landlord, creates a
property from a neighbourhood it discovered through the API, uploads a
photograph, accepts the agreement, has an officer verify and publish, then
registers a tenant, verifies their identity, requests a viewing, dispatches
it, files a field report, conducts it, opens a deal, and walks it through
escrow, move-in, commission, settlement and close — then asserts eleven
authorisation refusals. If a step cannot be done there, it cannot be done by
a user.

`apps/web/e2e/` does the same through a real browser, at 1440px and 412px,
clicking the actual controls. It proves people can *find* the buttons that
the HTTP script proves exist.

When you add a capability, add it to both. When you find a test that reaches
past the API, fix the test.

---

## 8. Known limitations

| Limitation | Detail |
|---|---|
| Mandate submission has no route | Brokers and management companies cannot publish. The remaining half of F-003 |
| Identity provider is a mock | Behind `IdentityProvider`; every surface saying so |
| PSP is a mock | Behind `PaymentProvider`; the ledger is correct regardless |
| Photographs live on the filesystem | `MEDIA_ROOT`; needs a persistent disk in production (DEPLOYMENT.md §2.3) |
| API Jest suite not re-run since the web migration | Two read contracts widened (`findForTenant`, `findForParty`); specs asserting the old bare-row shapes are expected to need updating |
| No rate limiting | Deferred in `DOMAIN.md`; add at the edge before public launch |
| Better Auth is mounted but inert | Nothing trusts its sessions; `JwtAuthGuard` still resolves the `session` table (F-010) |

---

## 9. If you change something

- **A business rule** → it is one of the 11 decisions, or it follows from
  one. Record a dated amendment in the SSOT. Do not diverge silently.
- **The money path** → read the invariants in §2 first. If you find a
  contradiction, stop that change, document it, and resolve it before
  touching the money logic.
- **An API contract** → update
  `docs/House_For_Rent_API_Specification.md` as a numbered amendment, with
  the reasoning, not just the shape.
- **A defect** → add it to `HOUSE_FOR_RENT_ENGINEERING_FINDINGS.md` with
  evidence. Findings are never deleted; they move to `RESOLVED` or
  `SUPERSEDED` with what closed them.
- **Anything a user touches** → it is not complete until a real client can
  reach it. See §7.
