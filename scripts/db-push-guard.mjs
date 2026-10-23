/**
 * db:push guard — `prisma db push` DIFFS THE ENTIRE SCHEMA against the
 * target database and offers destructive changes. Against the production
 * Supabase database (real business records + immutability triggers) that is
 * forbidden: schema changes go through reviewed migrations, never a push.
 */
import { spawnSync } from 'node:child_process';
import { isProductionDatabase } from './production-guard.mjs';

if (isProductionDatabase()) {
  console.error(
    'REFUSING to run `prisma db push` — DATABASE_URL points at the PRODUCTION database.\n' +
      'A push would diff the whole schema against live business data and could destroy it.\n' +
      'Schema changes on production go through reviewed migrations only.',
  );
  process.exit(1);
}

const result = spawnSync('bunx', ['prisma', 'db', 'push', '--accept-data-loss'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
