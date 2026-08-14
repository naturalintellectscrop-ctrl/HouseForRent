# Deployment

Three surfaces, three destinations. They are not interchangeable, and the
order below matters: the console is useless without the API, and the API is
useless without the database.

| Surface | Goes to | Why |
|---|---|---|
| `apps/api/` (NestJS) | **Render / Railway / Fly** — a persistent Node process | The ledger runs multi-statement transactions and Prisma holds a connection pool. Serverless is the worst fit for exactly that workload: a cold start on every money endpoint, and a new connection per invocation. |
| `apps/console/` (Next.js 16) | **Vercel** | It is what Vercel runs. Server components, server actions, no special config. |
| `apps/mobile/` (Expo) | **EAS Build → Play Store** | An APK, not a website. |
| PostgreSQL | **Neon / Supabase / provider-managed** | Never on Vercel. |

---

## 0. Before anything: close the migration TODO

`DOMAIN.md` has carried this since Stage 0:

> the standard `prisma migrate deploy` path is currently **unexercised** —
> only the `migrate diff` + raw-`pg`-apply workaround has actually run.

That workaround exists because this project's local WASM Postgres cannot
complete Prisma's schema-engine handshake. **A real Postgres has no such
problem**, so the first hosted database is where the standard path gets
proven. Do it before wiring up any hosting, not during a deploy.

```bash
cd apps/api

# The DIRECT connection string, not the pooled one — Prisma Migrate takes
# advisory locks that a transaction-mode pooler silently drops.
export DATABASE_URL="postgresql://…?sslmode=require"

npx prisma migrate deploy
```

Expect all seven migrations to apply. Then confirm the DB-level guarantees
actually made it across — they are triggers, not schema, so a migration
that "succeeded" without them would leave the guarantees silently absent:

```bash
# Expect 10 rows: 9 immutability triggers + the conducted-viewing evidence
# trigger.
psql "$DATABASE_URL" -c "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1;"
```

If `migrate deploy` fails, fall back to the workaround
(`node test-infra/apply-migrations.mjs`) and record the failure in
`DOMAIN.md` — do not quietly switch paths.

---

## 1. Database (Neon or Supabase)

Either works. Neon's free tier is generous and its branching is convenient
for staging; Supabase bundles more you will not use here.

1. Create a project in a region near Kampala — **eu-central-1** (Frankfurt)
   is usually the lowest-latency option available on free tiers.
2. Copy **two** connection strings:
   - the **direct** URL → used for `migrate deploy` and set as
     `DATABASE_URL` on the backend host;
   - the **pooled** URL → only if you later hit connection limits.
3. Run step 0 against the direct URL.

> **Do not point the API at a transaction-mode pooler without testing.**
> The escrow path opens explicit transactions; a pooler in transaction mode
> can hand successive statements to different backends, which is precisely
> the divergence `reconciliation` exists to detect. Session mode is safe.

---

## 2. Backend API

Any host that runs a persistent Node process. Render is the shortest path.

**Build:** `npm ci && npm run build`
**Start:** `npm run start:prod`
**Health check path:** `/`

Environment variables — see `apps/api/.env.example` for the full annotated
list:

| Variable | Value |
|---|---|
| `DATABASE_URL` | the direct Postgres URL from step 1 |
| `JWT_SECRET` | **required** — `openssl rand -base64 48` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | the console's Vercel origin, once step 3 gives you one |
| `PORT` | usually injected by the host; leave unset |

> **`JWT_SECRET` is not optional and the app enforces that.** It refuses to
> boot without one, with the published development placeholder, or with
> anything under 32 characters (`src/auth/jwt-secret.ts`). This signs every
> access token: a guessable value lets anyone mint an `admin` token — which
> can create commission rate versions and read the audit log — while every
> guard still passes and nothing looks wrong. A service that will not start
> is an outage; one signing with a public secret is a breach.

### Provision the first admin

Staff accounts are never self-served (API Spec §3), so the first `admin`
has to be created directly against the database. `apps/api/seed-console-admin.mjs`
does this; run it once with `DATABASE_URL` pointed at production, then
**change that password immediately** — it is a known value in a committed
file.

Every subsequent staff account is created through
`POST /v1/auth/staff` by an existing admin.

---

## 3. Console (Vercel)

The console is a standard Next.js 16 app. It needs **no `vercel.json`** —
the defaults are correct.

1. **Import the repository** at vercel.com/new.
2. **Set the Root Directory to `apps/console`.** This is the one setting that
   matters: the repository is a monorepo, and without it Vercel builds the
   wrong thing. Vercel will then auto-detect Next.js, `npm run build`, and
   `.next`.
3. **Environment variables** (Settings → Environment Variables):

   | Variable | Value | Environments |
   |---|---|---|
   | `API_BASE_URL` | your backend's public URL, e.g. `https://houseforrent-api.onrender.com` | Production, Preview |

   > **Do not rename this to `NEXT_PUBLIC_API_BASE_URL`.** It is read
   > server-side only (`lib/api.ts`), which is what keeps the API base and
   > the bearer token out of the client bundle. The `NEXT_PUBLIC_` prefix
   > publishes a variable to every browser.

4. **Deploy.**

### After the first deploy

- **Set the backend's CORS origin** to the Vercel domain, or the console's
  server-side fetches will work while anything browser-side will not.
- **Session cookies are `secure` in production** (`lib/session.ts`), so the
  console only works over HTTPS. Vercel gives you that; a plain-HTTP
  preview will appear to accept a login and then bounce back to `/login`.
- **Vercel deployment protection** is worth leaving ON for this project.
  It is an internal ops console showing reconciliation balances and an
  audit trail; there is no reason for it to be publicly reachable.

---

## 4. Mobile

Not deployed here. `npx expo run:android` builds a dev client onto a
connected device; `eas build` produces a store artefact when you are ready.

The one thing to change for a real build: `apps/mobile/lib/api.ts` resolves the
API base from `EXPO_PUBLIC_API_BASE_URL`, falling back to the Android
emulator's host alias. Point it at the deployed API.

---

## What is deliberately NOT configured

| Absent | Why |
|---|---|
| Real PSP credentials | Behind `PaymentProvider`; procurement- and legal-gated (SSOT §8) |
| Real NIN/liveness provider | Behind `IdentityProvider`; same gate |
| Object storage for media | Behind `MediaStorageProvider`; V1 ships a mock |
| Rate limiting | Named as deferred in `DOMAIN.md`; add at the edge before public launch |
| `Idempotency-Key` middleware | `settle`/`refund` already derive deterministic server-side keys, so retries are safe today |

Each is an interface with a mock behind it, so contracting a provider is a
DI binding change and a credential — no other code moves.
