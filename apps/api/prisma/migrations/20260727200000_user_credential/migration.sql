-- CreateTable
CREATE TABLE "user_credential" (
    "id" TEXT NOT NULL,
    "user_account_id" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_credential_user_account_id_key" ON "user_credential"("user_account_id");

-- AddForeignKey
ALTER TABLE "user_credential" ADD CONSTRAINT "user_credential_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

