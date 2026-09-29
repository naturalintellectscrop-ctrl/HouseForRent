import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Query logging is opt-in (DEBUG_QUERIES=1): logging every statement makes
 * interactive transactions noticeably slower under bun, and the financial
 * paths run inside them.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.DEBUG_QUERIES
      ? ['query', 'error', 'warn']
      : ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
