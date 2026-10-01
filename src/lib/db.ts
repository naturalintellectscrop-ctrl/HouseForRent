import { PrismaClient } from '@prisma/client'

/**
 * Hardens the database URL for the runtime it actually runs on.
 *
 * The owner-supplied string points at Supabase's pooler on port 5432,
 * which is SESSION mode: every client pins a dedicated server connection
 * for the client's lifetime, and the free-tier pool holds only 15
 * clients. Warm Vercel serverless functions never release their
 * connections, so production eventually exhausts all 15 slots and every
 * data request fails with EMAXCONNSESSION - the exact 500s the live site
 * showed (sequential requests fine, parallel bursts dead).
 *
 * Three corrections, all Supabase's own serverless recommendation:
 *
 * - port 5432 → 6543: TRANSACTION mode. Connections are held only for
 *   the duration of a transaction and returned to the pool, so warm
 *   functions stop pinning server sessions.
 * - `pgbouncer=true`: transaction mode multiplexes server sessions
 *   across clients, so Prisma's session-bound prepared statements break
 *   intermittently. This flag switches Prisma to unprepared queries.
 * - `connection_limit=4` (+ `sslmode=require` if absent): a small bounded
 *   pool per instance. One connection starves this app's legitimate
 *   parallel fetches; the old unbounded default fanned a dozen sessions
 *   per render. Four bounds both failure modes while transaction mode
 *   multiplexes the shared server side.
 *
 * Applied ONLY to Supabase pooler hosts, so local strings and any future
 * direct connection are untouched. Doing it here - rather than asking
 * for a specific string in Vercel env - means the value the owner
 * pasted can stay exactly as it is.
 */
function hardenedDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.includes('pooler.supabase.com')) return url;
  // Session mode (5432) → transaction mode (6543), same pooler host.
  let next = url.replace(':5432/', ':6543/');
  if (!/[?&]pgbouncer=true/.test(next)) {
    next += (next.includes('?') ? '&' : '?') + 'pgbouncer=true';
  }
  if (!/[?&]connection_limit=/.test(next)) {
    next += (next.includes('?') ? '&' : '?') + 'connection_limit=4';
  }
  if (!/[?&]sslmode=/.test(next)) {
    next += (next.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  return next;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: hardenedDatasourceUrl(),
    log: process.env.DEBUG_QUERIES
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  })
}

/**
 * Query logging is opt-in (DEBUG_QUERIES=1): logging every statement makes
 * interactive transactions noticeably slower under bun, and the financial
 * paths run inside them.
 *
 * The client is built LAZILY, on the first property access. PrismaClient
 * validates its datasource URL at construction, so an eager `new
 * PrismaClient()` throws the moment any module merely imports `db`. On
 * Vercel that meant: DATABASE_URL missing (or mistyped) did not fail a
 * request, it failed the BUILD, because `next build` imports every route
 * module to collect its config. With the proxy, importing is free and only
 * an actual query needs a database, which is exactly the coupling a build
 * should have: none.
 *
 * Only the REAL client is ever cached on the global (never the proxy
 * itself, which would re-enter the traps on the next access). The cache
 * keeps the single-instance behaviour in dev: hot reload must not open a
 * new connection pool per recompile.
 */
function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createClient()
  return globalForPrisma.prisma
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient()
    const value = Reflect.get(client, prop)
    return typeof value === 'function' ? value.bind(client) : value
  },
  has(_target, prop) {
    return Reflect.has(getClient(), prop)
  },
})
