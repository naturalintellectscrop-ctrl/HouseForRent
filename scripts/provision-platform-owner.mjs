#!/usr/bin/env node
/**
 * Provision (or rotate credentials for) the PLATFORM OWNER account.
 *
 * ── The secure mechanism, and why it looks like this ──
 * The owner account is a REAL account in the one existing identity system:
 * a Party row, a UserAccount row carrying the platform-level `admin` role,
 * and a UserCredential row holding only a bcrypt hash. Nothing here creates
 * a second database, a backdoor, or a role users can self-assign - self-
 * service registration refuses non-tenant/lister roles (register route DTO
 * allowlist), so `admin` is reachable ONLY through this operator mechanism.
 *
 * ── Credential handling rules (hard) ──
 * - The password arrives ONLY via the OWNER_PASSWORD environment variable.
 *   It is never defaulted, never written to disk, never logged, never put in
 *   the audit payload, never committed.
 * - The database URL arrives via PROVISION_DATABASE_URL (or DATABASE_URL).
 * - The script is idempotent: re-running it rotates the credential and
 *   revokes existing sessions for the account.
 *
 * ── Additive schema step ──
 * The optional `party.email` identifier is ensured here with ADD COLUMN IF
 * NOT EXISTS + a unique index (no pre-existing row is touched - the same
 * precedent as the SavedListing table). The repo's schema.prisma declares
 * the matching field.
 *
 * Usage:
 *   PROVISION_DATABASE_URL="postgresql://..." \
 *   OWNER_EMAIL="naturalintellectsltd@gmail.com" \
 *   OWNER_PHONE="+256762449504" \
 *   OWNER_PASSWORD="..." \
 *   node scripts/provision-platform-owner.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

const DATABASE_URL = process.env.PROVISION_DATABASE_URL || process.env.DATABASE_URL;
const OWNER_PASSWORD = process.env.OWNER_PASSWORD;
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'naturalintellectsltd@gmail.com').toLowerCase().trim();
const OWNER_PHONE = (process.env.OWNER_PHONE || '+256762449504').trim();
const OWNER_NAME = process.env.OWNER_NAME || 'Natural Intellects Ltd';

function fail(message) {
  console.error(red(`✗ ${message}`));
  process.exit(1);
}

if (!DATABASE_URL || !/^postgres(ql)?:\/\//.test(DATABASE_URL)) {
  fail('PROVISION_DATABASE_URL (or DATABASE_URL) must be a postgres:// connection string.');
}
if (!OWNER_PASSWORD || OWNER_PASSWORD.length < 8) {
  fail('OWNER_PASSWORD must be set (minimum 8 characters) and must never be committed anywhere.');
}

const db = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

async function ensureEmailColumn() {
  // Additive and idempotent; touches no pre-existing row.
  await db.$executeRawUnsafe(`ALTER TABLE "party" ADD COLUMN IF NOT EXISTS "email" text`);
  await db.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "party_email_key" ON "party"("email")`,
  );
}

async function main() {
  console.log('→ Ensuring the additive email identifier column…');
  await ensureEmailColumn();

  console.log('→ Resolving the owner party (by phone, then email)…');
  let party = await db.party.findFirst({
    where: { OR: [{ primaryPhone: OWNER_PHONE }, { email: OWNER_EMAIL }] },
  });

  let partyCreated = false;
  if (!party) {
    party = await db.party.create({
      data: {
        displayName: OWNER_NAME,
        primaryPhone: OWNER_PHONE,
        email: OWNER_EMAIL,
        status: 'active',
      },
    });
    partyCreated = true;
  } else {
    await db.party.update({
      where: { id: party.id },
      data: {
        // Fill the email identifier if this party predates it; never clobber
        // a phone that already belongs to someone else (lookup was by either).
        email: party.email ?? OWNER_EMAIL,
        // The operator account must never be parked in a sign-in-blocked state.
        status: 'active',
      },
    });
  }

  console.log('→ Resolving the platform-level account (role: admin)…');
  let account = await db.userAccount.findFirst({ where: { partyId: party.id } });
  let roleChanged = false;
  if (!account) {
    account = await db.userAccount.create({
      data: { partyId: party.id, authRole: 'admin' },
    });
  } else if (account.authRole !== 'admin') {
    roleChanged = true;
    account = await db.userAccount.update({
      where: { id: account.id },
      data: { authRole: 'admin' },
    });
  }

  console.log('→ Writing the credential (bcrypt, cost 10 - identical to the app)…');
  const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const existingCredential = await db.userCredential.findUnique({
    where: { userAccountId: account.id },
  });
  await db.userCredential.upsert({
    where: { userAccountId: account.id },
    create: { userAccountId: account.id, passwordHash },
    update: { passwordHash },
  });

  console.log('→ Revoking existing sessions for the account…');
  const revoked = await db.session.updateMany({
    where: { userAccountId: account.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  console.log('→ Writing the audit record…');
  await db.auditEvent.create({
    data: {
      actorPartyId: party.id,
      eventType: 'platform_owner_provisioned',
      subjectRef: account.id,
      payload: {
        partyCreated,
        roleChanged,
        sessionsRevoked: revoked.count,
        // Contact identifiers only. The password NEVER enters the audit trail.
        operatorEmail: OWNER_EMAIL,
        operatorPhone: OWNER_PHONE,
      },
      occurredAt: new Date(),
    },
  });

  console.log(green('\n✓ Platform owner provisioned.'));
  console.log(`  Party           : ${party.id}`);
  console.log(`  Account         : ${account.id} (role: ${account.authRole})`);
  console.log(`  Sign-in email   : ${OWNER_EMAIL}`);
  console.log(`  Sign-in phone   : ${OWNER_PHONE}`);
  console.log(`  Sessions revoked: ${revoked.count}`);
  console.log('  Sign-in surface : /platform/login (email or phone + password)');
  console.log('  The password itself was never logged, stored in plaintext, or audited.');
}

main()
  .catch((err) => fail(err instanceof Error ? err.message : String(err)))
  .finally(() => db.$disconnect());
