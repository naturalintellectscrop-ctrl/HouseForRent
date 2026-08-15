import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * ── Transaction timeouts are set for a REMOTE database ──
 * Prisma defaults to `maxWait: 2000` (how long to wait for a connection
 * before starting) and `timeout: 5000` (how long the transaction may run).
 * Both are generous against a local socket and genuinely tight against a
 * hosted Postgres: Kampala → Frankfurt is roughly 150–200ms per round trip,
 * so a three-statement transaction has spent most of a second on latency
 * before doing any work, and acquiring a connection under load can exceed
 * 2s on its own.
 *
 * The failure that motivated this is misleading when it happens — Prisma
 * reports "Unable to start a transaction in the given time", which reads
 * like a deadlock or a stuck query rather than "the pool was briefly busy
 * and the deadline was too short for this network".
 *
 * These are ceilings, not budgets: nothing waits longer than it needs to,
 * and a transaction that genuinely hangs still fails rather than holding
 * locks indefinitely.
 */
const TRANSACTION_OPTIONS = {
  /** Waiting for a free connection. */
  maxWait: 10_000,
  /** The transaction's own execution, once started. */
  timeout: 20_000,
} as const;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL must be set');
    }
    super({
      adapter: new PrismaPg({ connectionString }),
      transactionOptions: TRANSACTION_OPTIONS,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
