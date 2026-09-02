# Deployment

Two deployables, and the order matters: the web app is useless without the
API, and the API is useless without the database.

| Surface | Goes to | Why |
|---|---|---|
| `apps/api/` (NestJS) | **Render / Railway / Fly** — a persistent Node process | The ledger runs multi-statement transactions and Prisma holds a connection pool. Serverless is the worst fit for exactly that workload: a cold start on every money endpoint, and a new connection per invocation. |
| `apps/web/` (Next.js 16) | **Vercel** | It is what Vercel runs. Server components, server actions, no special config. |
| PostgreSQL | **Neon / Supabase / provider-managed** | Never on Vercel. |
| Listing photographs | **A volume on the API host**, or an object store | Served by the API from `MEDIA_ROOT`. See §2.3. |

> **2026-08-24.** This document previously listed a third destination —
> `apps/mobile` to EAS Build and the Play Store. The Expo client has been
> removed; House For Rent is a website, and `apps/web` carries the public
> marketplace, both user portals and the operations console in one
> deployment. See Technical Architecture §7.

---

## 0. Before anything: prove `prisma migrate deploy`

`DOMAIN.md` carried this from Stage 0:

> the standard `prisma migrate deploy` path is currently **unexercised** —
> only the `migrate diff` + raw-`pg`-apply workaround has actually run.

That workaround existed because the local WASM Postgres could not complete
Prisma's schema-engine handshake. **A real Postgres has no such problem.**

**Status: closed, 2026-08-24.** `npx prisma migrate deploy` was run against
the hosted Supabase instance and applied `20260824100000_listing_photos`
cleanly through the standard path. Use it.

```bash
cd apps/api

# The DIRECT connection string, not the pooled one — Prisma Migrate takes
# advisory locks that a transaction-mode pooler silently drops.
export DATABASE_URL="postgresql://…?sslmode=require"

npx prisma migrate deploy
```

Expect all ten migrations to apply. Then confirm the DB-level guarantees
actually made it across — they are triggers, not schema, so a migration that
"succeeded" without them would leave the guarantees silently absent:

```bash
# Expect 10 rows: 9 immutability triggers + the conducted-viewing evidence
# trigger.
psql "$DATABASE_URL" -c "SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1;"
```

---

## 1. Database

Neon or Supabase both work. Neon's branching is convenient for staging;
Supabase bundles more you will not use here.

1. Create a project in a region near Kampala — **eu-central-1** (Frankfurt)
   is usually the lowest-latency option on a free tier.
2. Copy **two** connection strings:
   - the **direct** URL → used for `migrate deploy` and set as
     `DATABASE_URL` on the API host;
   - the **pooled (session-mode)** URL → only if you hit connection limits.
3. Run §0 against the direct URL.

> **Do not point the API at a transaction-mode pooler.** The escrow path
> opens explicit transactions and takes `SELECT … FOR UPDATE` row locks; a
> pooler in transaction mode can hand successive statements to different
> backends, which is precisely the divergence `reconciliation` exists to
> detect. **Session mode is safe.**

---

## 2. The API

Any host that runs a persistent Node process. Render is the shortest path.

Because this is an npm workspace, build and start from the **repository
root** and name the workspace — do not set a root directory of `apps/api`,
or the shared `node_modules` at the top will not be installed.

- **Build:** `npm ci && npm run build --workspace @hfr/api`
- **Start:** `npm run start:prod --workspace @hfr/api`
- **Health check path:** `/`

> **Run migrations as a release step, not at boot.** Several instances
> starting at once would each try to migrate; Prisma's advisory lock turns
> that into a stall rather than a race, but a failed migration then becomes
> a failed deploy with no clear cause. On Render this is the "Pre-Deploy
> Command": `npm run migrate --workspace @hfr/api`

### 2.1 Environment

See `apps/api/.env.example` for the full annotated list.

| Variable | Value |
|---|---|
| `DATABASE_URL` | the direct Postgres URL from §1 |
| `JWT_SECRET` | **required** — `openssl rand -base64 48` |
| `NODE_ENV` | `production` |
| `CORS_ORIGINS` | the web app's origin, once §3 gives you one |
| `MEDIA_ROOT` | absolute path to the photograph directory — see §2.3 |
| `PORT` | usually injected by the host; leave unset |

> **`JWT_SECRET` is not optional and the app enforces that.** It refuses to
> boot without one, with the published development placeholder, or with
> anything under 32 characters (`src/auth/jwt-secret.ts`). This signs every
> access token: a guessable value lets anyone mint an `admin` token — which
> can create commission rate versions and read the audit log — while every
> guard still passes and nothing looks wrong. A service that will not start
> is an outage; one signing with a public secret is a breach.

`dotenv` is loaded before the Nest bootstrap so local development and deployed
runtime variables are available consistently. In production, platform-managed
variables are used directly.

### 2.2 CORS

`CORS_ORIGINS` is a comma-separated allowlist of exact origins, deliberately
not `origin: true`. Reflecting whatever `Origin` a request arrives with is
equivalent to no CORS at all, and this API exposes money and
state-transition endpoints.

**Unset means no cross-origin browser access**, which is the correct default:
the web app talks to the API from its own server, so its normal operation
needs no CORS at all. Set it only if something browser-side must reach the
API directly — and note that `<img src>` is not subject to CORS, so
photographs work either way.

### 2.3 Listing photographs

The API serves photograph bytes itself, from `GET /v1/media/:mediaAssetId`.
`PhotoStore` writes them under `MEDIA_ROOT` (default `var/media` beside the
API), content-addressed by SHA-256.

**On an ephemeral filesystem, photographs will disappear on redeploy.** On
Render, attach a **persistent disk** and point `MEDIA_ROOT` at its mount
path. The object-store alternative is a change to `PhotoStore` alone —
nothing above it knows where a byte lives.

Serving through the API rather than handing out object-store URLs is
deliberate: moving storage, or gating a photograph later, must not break
every link already in circulation.

### 2.4 Provision the first admin

Staff accounts are never self-served (API Spec §3), so the first `admin` has
to be created directly against the database.

```bash
cd apps/api
DATABASE_URL="…" DEMO_PASSWORD="$(openssl rand -base64 24)" \
  node scripts/seed-web-demo.mjs
```

The script **refuses to run without `DEMO_PASSWORD`** (F-009): a password in
the repository is a password in every fork, every CI log and every
screen-share, and these accounts include an admin who can move money.

Every subsequent staff account is created through `POST /v1/auth/staff` by
an existing admin.

> On a production database you almost certainly want the accounts and the
> corridor but **not** the twelve fixture properties. Run the script against
> staging, and create real inventory through the landlord portal — which is
> the point of having built it.

---

## 3. The web app (Vercel)

`vercel.json` at the repository root does the work. **Do not set a Root
Directory** — the root is correct, and overriding it makes the workspace
resolution fail.

1. **Import the repository** at vercel.com/new.
2. Leave the framework and directory settings alone; Vercel reads
   `vercel.json`.
3. **Environment variables** (Settings → Environment Variables):

   | Variable | Value | Environments |
   |---|---|---|
   | `API_BASE_URL` | the API's public URL, e.g. `https://houseforrent-api.onrender.com` | Production, Preview |
   | `NEXT_PUBLIC_MEDIA_BASE` | the same URL | Production, Preview |

   > **Do not rename `API_BASE_URL` to `NEXT_PUBLIC_API_BASE_URL`.** It is
   > read server-side only (`lib/api.ts`), which is what keeps the API base
   > and the bearer token out of the client bundle. The `NEXT_PUBLIC_`
   > prefix publishes a variable to every browser.
   >
   > `NEXT_PUBLIC_MEDIA_BASE` **is** public on purpose, and is the only such
   > variable: an `<img src>` has to resolve in the browser. It points at a
   > public image route and nothing else.

4. **Deploy.**

### One deployment, three surfaces

| Path | Serves | Auth |
|---|---|---|
| `/`, `/properties`, `/properties/[id]`, `/how-it-works`, `/for-landlords`, `/about`, `/contact` | The public marketplace | None — browsing requires no account (Decision 3) |
| `/login`, `/register` | Authentication | None |
| `/account/**` | Tenant portal | Tenant |
| `/landlord/**` | Landlord portal | Lister |
| `/ops/**` | Operations console | FOO / admin |

> **Vercel deployment protection must be OFF for this project.** The
> previous deployment was an internal console and protection was correct.
> This one has a public front door: a marketplace behind an access wall is
> not a marketplace. The `/ops` routes are protected by the API's own
> authorisation, which is where that protection belongs (NFR-1).

### After the first deploy

- **Session cookies are `secure` in production** (`lib/session.ts`), so
  sign-in only works over HTTPS. Vercel gives you that; a plain-HTTP preview
  will appear to accept a login and then bounce back to `/login`.
- **Check the photographs render.** If images 404, `NEXT_PUBLIC_MEDIA_BASE`
  is wrong or `MEDIA_ROOT` did not survive the API's last redeploy (§2.3).
- **Set `CORS_ORIGINS`** on the API only if something browser-side needs it.

---

## 4. Verifying a deployment

Two scripts, both driving the real thing over HTTP. Neither holds a database
connection — that is the whole point (F-011).

```bash
# Every step of the product journey, over HTTP, as a real client:
# public discovery → landlord registers → property → photos → agreement →
# verification → publish → tenant registers → identity → viewing → dispatch
# → field report → introduction → deal → escrow → move-in → commission →
# settlement → close, plus the authorisation refusals.
cd apps/api
API=https://your-api.example DEMO_PASSWORD=… node scripts/journey-http.mjs

# The same journeys through a real browser, at desktop and phone widths.
cd apps/web
E2E_BASE_URL=https://your-site.example npx playwright test
```

`journey-http.mjs` exits non-zero on any failure and prints which step broke.
It is the shortest way to tell whether a deployment is actually working, as
opposed to merely responding.

---

## 5. Local development

```bash
npm ci

# 1. Database + schema
cd apps/api
cp .env.example .env          # then set DATABASE_URL and JWT_SECRET
npx prisma migrate deploy
npx prisma generate

# 2. Demo corridor: Kampala neighbourhoods, 12 fixture properties with
#    generated placeholder artwork, and the five demo accounts.
DEMO_PASSWORD=choose-something node scripts/seed-web-demo.mjs

# 3. Run both, in two terminals, from the repository root
npm run api        # http://localhost:3000
npm run web        # http://localhost:3100
```

Open **http://localhost:3100**.

Demo accounts, all using whatever you set as `DEMO_PASSWORD`:

| Role | Phone | Name |
|---|---|---|
| Landlord | `+256700100001` | Nakato Sarah |
| Landlord | `+256700100002` | Ssebugwawo Peter |
| Tenant | `+256700100010` | Acen Grace (identity verified) |
| Field officer | `+256700100020` | Mugisha Daniel |
| Admin | `+256700100030` | Operations Desk |

---

## What is deliberately NOT configured

| Absent | Why |
|---|---|
| Real PSP credentials | Behind `PaymentProvider`; procurement- and legal-gated (SSOT §8) |
| Real NIN/liveness provider | Behind `IdentityProvider`; same gate. **Every surface that calls it says so** rather than implying a check against the national register |
| Object storage for media | Behind `PhotoStore`; V1 writes to a filesystem path (§2.3) |
| Rate limiting | Named as deferred in `DOMAIN.md`; add at the edge before public launch |
| `Idempotency-Key` middleware | `settle`/`refund` already derive deterministic server-side keys, so retries are safe today |
| A contact form | There is no enquiry endpoint. `/contact` routes people to channels that actually reach a human rather than posting into nothing |

Each is an interface with a mock behind it, so contracting a provider is a
DI binding change and a credential — no other code moves.
