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

Because this is an npm workspace, build and start from the **repository
root** and name the workspace — do not set a root directory of `apps/api`,
or the shared `node_modules` at the top will not be installed.

**Build:** `npm ci && npm run build --workspace @hfr/api`
**Start:** `npm run start:prod --workspace @hfr/api`
**Health check path:** `/`

> **Run migrations as a release step, not at boot.** Several instances
> starting at once would each try to migrate, and Prisma's advisory lock
> turns that into a stall rather than a race — but a failed migration would
> then also be a failed deploy with no clear cause. On Render this is the
> "Pre-Deploy Command":
> `npm run migrate --workspace @hfr/api`

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

## 3. Console (Vercel) — ONE project, no per-app setup

`vercel.json` at the repository root does the work: it builds only the
`@hfr/console` workspace and points `outputDirectory` at
`apps/console/.next`. **Do not set a Root Directory** — the root is correct,
and overriding it makes the workspace resolution fail.

1. **Import the repository** at vercel.com/new.
2. Leave the framework and directory settings alone. Vercel reads
   `vercel.json`.
3. **Environment variables** (Settings → Environment Variables):

   | Variable | Value | Environments |
   |---|---|---|
   | `API_BASE_URL` | your API's public URL, e.g. `https://houseforrent-api.onrender.com` | Production, Preview |
   | `NEXT_PUBLIC_APK_URL` | GitHub release asset URL for the Android build (optional) | Production |
   | `NEXT_PUBLIC_APK_VERSION` | e.g. `v1.0.0` (optional, cosmetic) | Production |

   > **Do not rename `API_BASE_URL` to `NEXT_PUBLIC_API_BASE_URL`.** It is
   > read server-side only (`lib/api.ts`), which is what keeps the API base
   > and the bearer token out of the client bundle. The `NEXT_PUBLIC_`
   > prefix publishes a variable to every browser.
   >
   > The two APK variables ARE `NEXT_PUBLIC_` on purpose: a download link is
   > meant to be public, and nothing secret is in it.

4. **Deploy.**

### One deployment, two surfaces

| Path | Serves |
|---|---|
| `/` | The FOO/admin console (auth-gated) |
| `/download` | The Android APK download page |

**The APK is not committed to the repository.** A debug build is ~79MB, git
keeps every version of it forever, and Vercel would redeploy the binary on
every unrelated push. Attach it to a GitHub release and point
`NEXT_PUBLIC_APK_URL` at the asset. Until that variable is set, `/download`
shows an honest empty state rather than a dead button.

### Why the API is still a separate host

It is one *Vercel project*, not one server. The API wants a persistent Node
process: the ledger opens multi-statement transactions and Prisma holds a
pool, which is the workload serverless handles worst — a cold start on
every money endpoint and a new connection per invocation. Vercel runs the
console; Render (or Railway/Fly) runs the API. Both deploy from this same
repository.

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
