import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  return new PrismaClient({
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
