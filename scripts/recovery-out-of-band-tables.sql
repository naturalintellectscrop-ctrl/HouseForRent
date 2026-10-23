-- Recovery-schema supplement: OUT-OF-BAND production tables.
--
-- The production database contains five tables that are NOT Prisma models
-- (created out-of-band): the better-auth pass (ba_user, ba_session,
-- ba_account, ba_verification — migration 20260804180000_better_auth_tables
-- was applied to production outside the migrations ledger) and a manual
-- tracking table (_applied_migrations). The Prisma-datamodel schema
-- (`prisma migrate diff --from-empty --to-schema-datamodel`) therefore does
-- NOT include them, and a restore of a full production export would fail
-- with 42P01 (found by the first real-data recovery drill, 2026-10-23).
--
-- This file mirrors their DDL as observed in the production catalog
-- (information_schema.columns / pg_indexes, read-only inspection
-- 2026-10-23). Apply AFTER the Prisma-datamodel schema when building a
-- recovery target. Owned by no migration — if these tables are ever moved
-- into prisma/schema.prisma, delete this supplement.
--
-- Rows in these tables at export time: all zero (verified) — but a restore
-- pipeline must be able to receive them regardless.

CREATE TABLE "_applied_migrations" (
    "name" text NOT NULL,
    "applied_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "_applied_migrations_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "ba_user" (
    "id" text NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "email_verified" boolean NOT NULL DEFAULT false,
    "image" text,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,
    "party_id" text,
    "role" text,
    CONSTRAINT "ba_user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ba_user_email_key" ON "ba_user" ("email");

CREATE TABLE "ba_session" (
    "id" text NOT NULL,
    "expires_at" timestamp(3) NOT NULL,
    "token" text NOT NULL,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,
    "ip_address" text,
    "user_agent" text,
    "user_id" text NOT NULL,
    CONSTRAINT "ba_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ba_session_token_key" ON "ba_session" ("token");
CREATE INDEX "ba_session_user_id_idx" ON "ba_session" ("user_id");
ALTER TABLE "ba_session" ADD CONSTRAINT "ba_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ba_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ba_account" (
    "id" text NOT NULL,
    "account_id" text NOT NULL,
    "provider_id" text NOT NULL,
    "user_id" text NOT NULL,
    "access_token" text,
    "refresh_token" text,
    "id_token" text,
    "access_token_expires_at" timestamp(3),
    "refresh_token_expires_at" timestamp(3),
    "scope" text,
    "password" text,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,
    CONSTRAINT "ba_account_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ba_account_user_id_idx" ON "ba_account" ("user_id");
ALTER TABLE "ba_account" ADD CONSTRAINT "ba_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "ba_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ba_verification" (
    "id" text NOT NULL,
    "identifier" text NOT NULL,
    "value" text NOT NULL,
    "expires_at" timestamp(3) NOT NULL,
    "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp(3) NOT NULL,
    CONSTRAINT "ba_verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ba_verification_identifier_idx" ON "ba_verification" ("identifier");
