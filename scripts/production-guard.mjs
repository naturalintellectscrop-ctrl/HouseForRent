/**
 * Production guard — refuses destructive sandbox tooling when DATABASE_URL
 * points at the live Supabase database. The sandbox seed/purge/QA utilities
 * were written for the disposable SQLite instance; against production they
 * would create demo accounts, delete real rows, or reset real passwords.
 *
 * Usage: import { assertSandboxDatabase } from './production-guard.mjs'
 * (or run this file directly to test the current environment).
 */
export function isProductionDatabase(url = process.env.DATABASE_URL ?? '') {
  return /supabase|pooler\.supabase|neon\.tech|render\.com|rds\.amazonaws/i.test(url);
}

export function assertSandboxDatabase(scriptName) {
  if (isProductionDatabase()) {
    console.error(
      `REFUSING to run ${scriptName}: DATABASE_URL points at a PRODUCTION database.\n` +
        'This tool only ever runs against the disposable sandbox instance.\n' +
        'If you genuinely intend a production operation, use a reviewed, explicit script instead.',
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(isProductionDatabase() ? 'PRODUCTION database detected' : 'sandbox database detected');
}
