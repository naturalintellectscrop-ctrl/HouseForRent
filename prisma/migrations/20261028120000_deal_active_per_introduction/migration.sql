-- Deal: one ACTIVE deal per introduction record (FINANCIAL_AUDIT.md F-2).
--
-- WHY A PARTIAL INDEX (not a plain unique): the business rule is "one LIVE
-- deal per introduction" — a deal that ended in a terminal state
-- (closed / cancelled / refunded) must NOT bar the same tenant and landlord
-- from trying again off the meeting that already happened
-- (src/server/deals.ts createFromIntroduction, comment block). A plain
-- UNIQUE (introduction_record_id) would forbid that legitimate retry.
--
-- WHAT IT ENFORCES: the check-then-insert inside createFromIntroduction is
-- a TOCTOU race on Postgres (READ COMMITTED): two concurrent calls can both
-- observe "no active deal" and both insert. This index makes the invariant
-- structural — the second insert fails with a unique violation instead of
-- silently duplicating an escrow flow.
--
-- STATUS: DRAFT — NOT APPLIED ANYWHERE. Apply through
--   TARGET_DATABASE_URL='…' ALLOW_PROD_MIGRATION=yes \
--   node scripts/apply-migration.mjs prisma/migrations/20261028120000_deal_active_per_introduction/migration.sql
-- after owner review. Prisma does not model partial indexes; if applied to a
-- database that `prisma db push` later manages, verify drift handling first
-- (scripts/db-push-guard.mjs).
--
-- Idempotency: CREATE UNIQUE INDEX IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS deal_one_active_per_introduction
  ON "deal" ("introduction_record_id")
  WHERE "introduction_record_id" IS NOT NULL
    AND "status" NOT IN ('closed', 'cancelled', 'refunded');
