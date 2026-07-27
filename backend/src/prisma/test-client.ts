import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/** Shared Prisma Client for integration tests, pointed at DATABASE_URL. */
export function createTestPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set to run integration tests');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
