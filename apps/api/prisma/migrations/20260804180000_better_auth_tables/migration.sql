-- Better Auth's four tables, namespaced `ba_`.
--
-- Additive only. Nothing here touches `session`, `user_account` or
-- `user_credential`: Better Auth's default table names collide with the
-- existing auth (both want a table called `session`, with incompatible
-- shapes), so its tables live alongside rather than replacing them. No
-- request path reads these yet.

CREATE TABLE IF NOT EXISTS "ba_user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "party_id" TEXT,
    "role" TEXT,
    CONSTRAINT "ba_user_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ba_user_email_key" ON "ba_user"("email");

CREATE TABLE IF NOT EXISTS "ba_session" (
    "id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "ba_session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ba_session_token_key" ON "ba_session"("token");
CREATE INDEX IF NOT EXISTS "ba_session_user_id_idx" ON "ba_session"("user_id");

CREATE TABLE IF NOT EXISTS "ba_account" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ba_account_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ba_account_user_id_idx" ON "ba_account"("user_id");

CREATE TABLE IF NOT EXISTS "ba_verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ba_verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ba_verification_identifier_idx" ON "ba_verification"("identifier");

-- Guarded so a partially-applied run can be resumed rather than needing the
-- database reset. Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so the
-- catalogue is checked directly.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ba_session_user_id_fkey') THEN
    ALTER TABLE "ba_session" ADD CONSTRAINT "ba_session_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "ba_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ba_account_user_id_fkey') THEN
    ALTER TABLE "ba_account" ADD CONSTRAINT "ba_account_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "ba_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
