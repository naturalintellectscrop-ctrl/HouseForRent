# Shipping from GitHub

Everything is on `github.com/naturalintellectscrop-ctrl/HouseForRent`. This
is how work gets from a branch into production.

---

## 1. Where the code is now

```
main                              ← last release
design-system-implementation      ← 4 commits, pushed, not yet merged
```

The branch carries the design-system implementation, the device-testing
fixes, the Better Auth install, and the reference packs. Nothing is on
`main` yet.

---

## 2. Open the pull request

```bash
gh pr create \
  --base main \
  --head design-system-implementation \
  --title "Design system implementation, Better Auth install, deploy docs" \
  --body-file docs/pr-body.md
```

Or in the browser: GitHub shows a **Compare & pull request** banner on the
repo home page for any recently pushed branch.

**Review it before merging.** Four commits, and the messages are the
review notes — each says what changed and, more usefully, what was
deliberately *not* changed and why. The one that matters most is the Better
Auth commit: it explains why the guards were left pointing at the existing
session table.

---

## 3. Branch protection

Before this repo has more than one contributor, turn on the minimum:

**Settings → Branches → Add branch ruleset**, targeting `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass (once §4 exists)
- ✅ Block force pushes

The immutability triggers in `prisma/migrations/*_immutable_tables/` exist
because this system's ledger must not be rewritten. A force-pushable main
branch is the same category of mistake one layer up.

---

## 4. CI — run the tests GitHub cannot currently run

There is no workflow yet, and two things must be fixed before one will work:

**a. `mobile/` cannot `npm install` cleanly.** `react-dom@19.2.8`
(transitive, via expo-router) requires `react@^19.2.8` against a pinned
`19.2.3`. CI needs `--legacy-peer-deps`, or the conflict resolved properly.

**b. The backend tests have no `DATABASE_URL` wiring.** Bare `jest` has no
`setupFiles`, so `PrismaService` throws and all 402 tests fail before
running. They need the env exported.

A first workflow that reflects reality:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  console:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: admin-web } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: admin-web/package-lock.json }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npx eslint .
      - run: npx next build

  mobile:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: mobile } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      # See (a) above — the tree does not resolve without this.
      - run: npm install --legacy-peer-deps
      - run: npx tsc --noEmit

  backend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: backend } }
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: houseforrent_test
        options: >-
          --health-cmd pg_isready --health-interval 10s
          --health-timeout 5s --health-retries 5
        ports: ['5432:5432']
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/houseforrent_test
      JWT_SECRET: ${{ secrets.CI_JWT_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm, cache-dependency-path: backend/package-lock.json }
      - run: npm ci
      - run: npx prisma generate
      - run: node test-infra/apply-migrations.mjs
      - run: npm test
```

Note the backend job uses a **throwaway Postgres service container**, not
Supabase. The integration tests write real rows; pointing them at the
development database is why it currently holds ~318 listings named
`JourneyHood-...`. `apply-migrations.mjs` replays every migration from
scratch, which is exactly right for a fresh container and exactly wrong
against a live database.

`CI_JWT_SECRET` goes in **Settings → Secrets and variables → Actions**.
`resolveJwtSecret()` rejects weak values, so generate a real one:

```bash
openssl rand -base64 48
```

---

## 5. Connect GitHub to Vercel

Vercel deploys from the repo, so this is a GitHub concern too.

1. Vercel → **Add New → Project** → **Import Git Repository** → authorise
   the GitHub App on this repo.
2. **Root Directory: `admin-web`** (monorepo — without this it builds the
   repo root and fails).
3. Environment variables per `docs/DEPLOYMENT_VERCEL.md`.

Once connected:

- every push to `main` → **Production** deploy
- every pull request → **Preview** deploy with its own URL, commented on
  the PR

**Turn on Deployment Protection** (Settings → Deployment Protection →
Vercel Authentication → Standard). Preview URLs are public by default, and
a preview of a staff console for a system that moves money should not be.

Vercel only ever builds `admin-web`. The backend and the mobile app are
deployed separately — see `docs/DEPLOYMENT_VERCEL.md` §3 and §4.

---

## 6. Secrets — check before making the repo public

`backend/.env` is gitignored and is **not** in the repository; verify before
any visibility change:

```bash
git log --all --full-history -- backend/.env      # expect: no output
```

It contains a live Supabase password and the JWT secret. If it ever appears
in history, rotate both — removing the commit is not enough, because the
value was already published.

---

## 7. Release flow, end to end

1. Branch from `main`.
2. Push; open a PR. CI runs; Vercel posts a preview.
3. Review, merge.
4. Vercel deploys `admin-web` to production automatically.
5. Deploy the backend to its container host, running
   `npx prisma migrate deploy` as a release step **before** the new version
   serves traffic.
6. `eas build` the mobile app when its code changed.

Backend first, always. The console and the app are its clients, and both
deploy green against an API that is not there.
