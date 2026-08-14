-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "user_account_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_user_account_id_idx" ON "session"("user_account_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

