-- Rate-limit counters (P-11 security round, 2026-11-01): durable fixed-window
-- attempt storage shared by every deployed instance.
--
-- PURELY ADDITIVE: one new table + its two indexes. No existing table, column,
-- index or constraint is touched; no business data is read or rewritten.
--
-- STATUS: DRAFT - NOT APPLIED TO PRODUCTION. Apply through the rails in
--   scripts/apply-migration.mjs (ledger row written atomically) after owner
--   review:
--   TARGET_DATABASE_URL='…' ALLOW_PROD_MIGRATION=yes \
--   node scripts/apply-migration.mjs prisma/migrations/20261101120000_rate_limit_counters/migration.sql
--
-- Until this lands, the credential limiter FAILS OPEN on the missing table
-- (P2021) and the in-memory layer still throttles per instance - production
-- behaviour is unchanged until the owner applies this file.
--
-- Rollback path (owner-reviewed):
--   DROP TABLE IF EXISTS "rate_limit_counter";

CREATE TABLE "rate_limit_counter" (
    "id" TEXT NOT NULL,
    "bucket_key" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_counter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_counter_bucket_key_key" ON "rate_limit_counter"("bucket_key");

-- CreateIndex
CREATE INDEX "rate_limit_counter_updated_at_idx" ON "rate_limit_counter"("updated_at");
