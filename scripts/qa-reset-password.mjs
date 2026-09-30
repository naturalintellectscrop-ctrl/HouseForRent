/**
 * QA utility — resets the password of every account in the SANDBOX demo
 * database to QA_PASSWORD so future QA rounds can sign in as any demo role.
 *
 * Refuses to run without QA_PASSWORD (same rule as seed-demo.mjs, F-009:
 * never a committed password). Sandbox use only — the real repo uses
 * Supabase auth and this script must never be copied there.
 *
 * Run: node --env-file=.env.local scripts/qa-reset-password.mjs
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';
import { assertSandboxDatabase } from './production-guard.mjs';

const prisma = new PrismaClient();
const QA_PASSWORD = process.env.QA_PASSWORD;
if (!QA_PASSWORD) {
  console.error('Refusing to reset without QA_PASSWORD (F-009).');
  process.exit(1);
}
assertSandboxDatabase('scripts/qa-reset-password.mjs');

function hash(password) {
  const salt = randomBytes(16).toString('hex');
  // Must match src/server/auth.ts hashPassword: scrypt$salt$hex(32 bytes).
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString('hex')}`;
}

const accounts = await prisma.userAccount.findMany({ select: { id: true } });
for (const a of accounts) {
  await prisma.userCredential.updateMany({
    where: { userAccountId: a.id },
    data: { passwordHash: hash(QA_PASSWORD) },
  });
}
console.log(`Reset ${accounts.length} demo credential rows to the QA password from .env.local.`);
await prisma.$disconnect();
