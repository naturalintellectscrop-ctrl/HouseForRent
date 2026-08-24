> **Superseded 2026-08-24 — read [`DEPLOYMENT.md`](./DEPLOYMENT.md) instead.**
>
> This document was written when the repository had three deployables: a
> staff console on Vercel, an API on Render, and an Expo mobile app on EAS.
> The Expo client has been removed and `apps/console` is now `apps/web`,
> carrying the public marketplace, both user portals and the operations
> console in one Next.js deployment (Technical Architecture §7).
>
> It is kept rather than deleted because the parts below that are still
> accurate — why the API cannot be serverless, and the order of operations — have not been repeated in the new document, and a reader
> arriving from an old link deserves to be told where to go rather than
> silently given stale instructions.

---

# Deploying House For Rent

Three surfaces, three different targets. Only one of them belongs on Vercel.

| Surface | What it is | Where it goes |
|---|---|---|
| `apps/console` | Next.js 16 field console | **Vercel** |
| `apps/api` | NestJS + Prisma, long-lived server | **Not Vercel** — see §3 |
| `apps/mobile` | Expo / React Native | **EAS Build** → Play Store |

---

## 1. Before anything

Two facts decide the whole shape of the deployment.

**The database is already hosted.** `apps/api/.env` points at Supabase
(`aws-0-eu-central-1.pooler.supabase.com`, session pooler, port 5432). There
is nothing to provision — but note the region: eu-central-1 from Kampala is
roughly 150–200ms per round trip, and registration already takes >15s
because bcrypt runs on top of that latency. If you have not load-tested
signup, do it before launch.

**The console never calls the API from the browser.** Every page in
`apps/console` is a server component using `lib/api.ts` server-side. That is
why `CORS_ORIGINS` can stay unset and why the API does not need to be
public — only reachable from Vercel's servers.

---

## 2. `apps/console` → Vercel

### 2.1 Import

Vercel → **Add New → Project** → import the GitHub repo. Because the repo is
a monorepo, set:

- **Root Directory**: `apps/console`
- **Framework Preset**: Next.js (auto-detected)
- Build command, output dir, install command: leave as detected

### 2.2 Environment variables

Set these in **Settings → Environment Variables**, for Production and
Preview both:

```
API_BASE_URL=https://<your-api-host>
```

Check `apps/console/lib/api.ts` for the exact variable name it reads and add
any others it requires. Anything the browser must see has to be prefixed
`NEXT_PUBLIC_` — and deliberately, **the API base URL should not be**. It is
read server-side only; making it public would advertise the API origin to
every visitor for no benefit.

### 2.3 Protect it

This console is staff-only and `app/layout.tsx` already sets
`robots: { index: false, follow: false }`. Add Vercel's own gate too:

**Settings → Deployment Protection → Vercel Authentication → Standard
Protection.** That puts every preview and production deployment behind your
Vercel team login, so an unfinished branch deploy is never a public login
page for a system that moves money.

### 2.4 Verify after first deploy

```
/login            → renders, no console errors
/                 → redirects to /login when signed out
```

Both should work with no API reachable — the login page is static. If `/`
throws instead of redirecting, `API_BASE_URL` is wrong or unreachable.

---

## 3. `apps/api` — why not Vercel

You can force NestJS onto Vercel functions, but this app should not go
there:

- **Prisma + connection pooling.** Every serverless invocation opens its own
  pool. Supabase's session pooler will exhaust under modest concurrency.
  Fixing it properly means the transaction pooler (port 6543) plus
  `pgbouncer=true`, and Prisma interactive transactions — which
  `LedgerService` depends on for atomic postings — are not supported through
  a transaction pooler.
- **Request duration.** Registration already exceeds 15s. Vercel's Hobby
  functions cap at 10s.
- **Boot cost.** `resolveJwtSecret()` and the Prisma client run per cold
  start.

The ledger's atomicity guarantee is the reason. `postings are atomic with
the caller transaction` is an explicit test, and it needs a real transaction
on a real connection.

**Deploy it to a container host instead** — Railway, Render, Fly.io, or a
plain VPS. All you need is `npm run build && node dist/main`.

Required environment:

```
DATABASE_URL=postgresql://...        # Supabase session pooler
JWT_SECRET=<32+ bytes, high entropy> # resolveJwtSecret() rejects weak values
BETTER_AUTH_SECRET=<32+ bytes>       # optional; falls back to JWT_SECRET
BETTER_AUTH_URL=https://<api-host>   # must match the public origin
NODE_ENV=production
PORT=3000
CORS_ORIGINS=https://<console>.vercel.app
```

`CORS_ORIGINS` is an exact-match allowlist and fails closed when unset. Set
it only if the console ever calls the API from the browser; today it does
not.

### 3.1 Migrations

`test-infra/apply-migrations.mjs` replays **every** migration from scratch —
it is for a fresh test database and will fail against a live one with
`type "PartyStatus" already exists`. For deployments use Prisma's own
migrator:

```
npx prisma migrate deploy
```

Run it as a release step, before the new version starts serving.

---

## 4. `apps/mobile` → EAS

Not Vercel. Expo builds through EAS:

```
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android --profile production
```

Set the API base at build time — `lib/api.ts` reads it and there is no
runtime override:

```
EXPO_PUBLIC_API_BASE_URL=https://<api-host>
```

Put it in `eas.json` under the profile's `env`, not in `app.json`, so debug
and production builds cannot pick up each other's value.

**`react-native-svg` is a native module.** Any existing dev client must be
rebuilt; an over-the-air update alone will not pick it up.

---

## 5. Order of operations

1. Deploy `apps/api` to the container host; confirm `/v1/listings` answers.
2. Run `prisma migrate deploy` against Supabase.
3. Deploy `apps/console` to Vercel with `API_BASE_URL` pointed at step 1.
4. Turn on Deployment Protection.
5. `eas build` the mobile app with `EXPO_PUBLIC_API_BASE_URL` pointed at
   step 1.

Do the backend first every time. The other two are clients of it, and a
console that deploys green against a missing API only fails once someone
signs in.

---

## 6. Known issues to resolve first

- **`npm install` is broken in `apps/mobile/`.** `react-dom@19.2.8` (transitive,
  via expo-router) requires `react@^19.2.8` against a pinned `19.2.3`.
  Everything needs `--legacy-peer-deps`. A CI install will fail without it.
- **The backend test suite has no `DATABASE_URL` wiring.** Bare `jest` has no
  `setupFiles`, so `PrismaService` throws and all 402 tests fail. Tests need
  the env exported. Worth adding a `setupFiles` entry before wiring CI.
- **`GET /v1/listings` is unpaginated** — currently 318 results, ~107KB.
- **The development database holds test fixtures.** Listings named
  `JourneyHood-...` are integration-test rows, not seed data. Do not point
  production at it without a clean-up.
