-- Auth hardening.
--
-- Entirely ADDITIVE: three new enum values, one nullable column, one new
-- table. No existing row changes meaning and nothing migrates, which is
-- what makes this safe to run against a database already holding live
-- accounts.
--
-- ── The enum caveat ──
-- Prisma warns that adding several values to an enum in one migration
-- fails on PostgreSQL 11 and earlier, because ALTER TYPE ... ADD VALUE
-- could not run inside a transaction there. Supabase runs 17.6 and the
-- local dev server is 17.5, so the single-migration form is correct for
-- both. Recorded here because a future target on an older Postgres would
-- need these split.

ALTER TYPE "PartyStatus" ADD VALUE IF NOT EXISTS 'pending_verification';
ALTER TYPE "PartyStatus" ADD VALUE IF NOT EXISTS 'disabled';
ALTER TYPE "PartyStatus" ADD VALUE IF NOT EXISTS 'archived';

-- Nullable: an account that has never signed in genuinely has no value,
-- and a sentinel date would make "never" indistinguishable from "long ago".
ALTER TABLE "user_account" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);

-- Password reset tokens. Hashed (SHA-256) exactly like refresh tokens: a
-- database disclosure must not hand over account-takeover ability.
-- Single-use via used_at, short-lived via expires_at.
--
-- Deliberately NOT immutable, unlike the 🔒 tables: this row is
-- legitimately mutated (marking it used) and legitimately deleted (expiry
-- cleanup). The same call already recorded for `session` in DOMAIN.md.
CREATE TABLE IF NOT EXISTS "password_reset_token" (
    "id" TEXT NOT NULL,
    "user_account_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_token_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_token_token_hash_key" ON "password_reset_token"("token_hash");
CREATE INDEX IF NOT EXISTS "password_reset_token_user_account_id_idx" ON "password_reset_token"("user_account_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_token_user_account_id_fkey'
  ) THEN
    ALTER TABLE "password_reset_token"
      ADD CONSTRAINT "password_reset_token_user_account_id_fkey"
      FOREIGN KEY ("user_account_id") REFERENCES "user_account"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
