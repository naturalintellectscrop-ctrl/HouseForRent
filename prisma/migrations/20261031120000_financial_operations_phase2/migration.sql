-- Financial operations Phase 2 (2026-10-31): duplicate-payment resolution
-- linkage + provider statement reconciliation storage.
--
-- PURELY ADDITIVE: three new enum types, one nullable column on refund_record,
-- two new tables, their indexes and one FK. No existing column, index or
-- constraint is touched; no financial history is read or rewritten.
--
-- STATUS: DRAFT - NOT APPLIED TO PRODUCTION. Apply through the rails in
--   scripts/apply-migration.mjs (ledger row written atomically) after owner
--   review:
--   TARGET_DATABASE_URL='…' ALLOW_PROD_MIGRATION=yes \
--   node scripts/apply-migration.mjs prisma/migrations/20261031120000_financial_operations_phase2/migration.sql
--
-- Rollback path (owner-reviewed, reverse order):
--   DROP TABLE IF EXISTS "provider_statement_line";
--   DROP TABLE IF EXISTS "provider_statement";
--   DROP INDEX IF EXISTS "refund_record_duplicate_of_instruction_id_idx";
--   DROP INDEX IF EXISTS "refund_record_kind_state_idx";
--   ALTER TABLE "refund_record" DROP COLUMN IF EXISTS "duplicate_of_instruction_id";
--   DROP TYPE IF EXISTS "ProviderLineMatchState";
--   DROP TYPE IF EXISTS "ProviderLineKind";
--   DROP TYPE IF EXISTS "ProviderStatementSource";
--
-- Idempotency: every statement is IF NOT EXISTS-safe where Postgres allows;
-- the additive column add is guarded by an IF NOT EXISTS.

ALTER TABLE "refund_record" ADD COLUMN IF NOT EXISTS "duplicate_of_instruction_id" TEXT;
ALTER TABLE "provider_statement_line" ADD COLUMN IF NOT EXISTS "line_seq" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "ProviderStatementSource" AS ENUM ('manual_import');

CREATE TYPE "ProviderLineKind" AS ENUM ('collection', 'payout', 'refund', 'fee', 'reversal');

CREATE TYPE "ProviderLineMatchState" AS ENUM ('matched', 'mismatch', 'duplicate', 'unexpected', 'unmatched');

CREATE TABLE "provider_statement" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'nylonpay',
    "source" "ProviderStatementSource" NOT NULL DEFAULT 'manual_import',
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "imported_by_party_id" TEXT NOT NULL,
    "note" TEXT,
    "line_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_statement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_statement_line" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT NOT NULL,
    "line_seq" INTEGER NOT NULL DEFAULT 0,
    "line_ref" TEXT,
    "provider_ref" TEXT NOT NULL,
    "kind" "ProviderLineKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "match_state" "ProviderLineMatchState" NOT NULL DEFAULT 'unmatched',
    "matched_instruction_id" TEXT,
    "match_note" TEXT,
    "raw" JSONB,

    CONSTRAINT "provider_statement_line_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provider_statement_provider_created_at_idx" ON "provider_statement"("provider", "created_at");

CREATE INDEX "provider_statement_line_statement_id_idx" ON "provider_statement_line"("statement_id");

CREATE INDEX "provider_statement_line_provider_ref_idx" ON "provider_statement_line"("provider_ref");

CREATE UNIQUE INDEX "provider_statement_line_statement_id_line_ref_key" ON "provider_statement_line"("statement_id", "line_ref");

CREATE INDEX "refund_record_kind_state_idx" ON "refund_record"("kind", "state");

CREATE INDEX "refund_record_duplicate_of_instruction_id_idx" ON "refund_record"("duplicate_of_instruction_id");

ALTER TABLE "provider_statement_line" ADD CONSTRAINT "provider_statement_line_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "provider_statement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

