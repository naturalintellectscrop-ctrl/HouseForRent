-- Deal: one ACTIVE deal per introduction record (FINANCIAL_AUDIT.md F-2).
--
-- WHY A PARTIAL INDEX (not a plain unique): the business rule is "one LIVE
-- deal per introduction" — a deal that ended in a terminal state must NOT
-- bar the same tenant and landlord from trying again off the meeting that
-- already happened (src/server/deals.ts createFromIntroduction, comment
-- block). A plain UNIQUE (introduction_record_id) would forbid that
-- legitimate retry.
--
-- TERMINAL SET (2026-11-02 amendment): the predicate below MUST list exactly
-- the authoritative TERMINAL_STATUSES in src/server/domain.ts —
-- closed / cancelled / refunded / reversed. The original draft listed three
-- and predates `reversed` (the provider-clawback terminal state the financial
-- architecture round added on 2026-10-30); with the old predicate a reversed
-- deal would have permanently occupied the index and the code-permitted retry
-- would have died as an unhandled unique violation. The readiness assessment
-- (2026-11-02) caught the drift before any apply; this file was still a
-- DRAFT, so the predicate is corrected in place — the ledger checksum is
-- computed from THIS file at apply time, so the correction is what ships.
--
-- WHAT IT ENFORCES: the check-then-insert inside createFromIntroduction is
-- a TOCTOU race on Postgres (READ COMMITTED): two concurrent calls can both
-- observe "no active deal" and both insert. This index makes the invariant
-- structural — the second insert fails with a unique violation instead of
-- silently duplicating an escrow flow.
--
-- P2002 HANDLING (companion code change, same round): the losing concurrent
-- insert in createFromIntroduction now surfaces as the typed
-- DealAlreadyExistsError (HTTP 409 DEAL_ALREADY_EXISTS) — never a raw Prisma
-- error and never an opaque 500.
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
    AND "status" NOT IN ('closed', 'cancelled', 'refunded', 'reversed');
