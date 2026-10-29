-- Landlord onboarding KYC (consolidated round, 2026-10-29).
--
-- PURELY ADDITIVE: one new table + four new enum types. No existing table,
-- column, index or constraint is touched. Applied through the rails in
-- scripts/apply-migration.mjs (ledger row written atomically).
--
-- Rollback path (owner-reviewed, reverse order):
--   DROP TABLE IF EXISTS "landlord_kyc";
--   DROP TYPE IF EXISTS "KycPayoutMethod";
--   DROP TYPE IF EXISTS "KycReviewState";
--   DROP TYPE IF EXISTS "KycRelationship";
--   DROP TYPE IF EXISTS "KycIdDocumentType";
--
-- Evidence FKs (id_front/back/selfie/ownership_evidence) are ON DELETE
-- RESTRICT on purpose: a decided review's evidence is part of the record,
-- and nothing may silently detach it. src/server/kyc.ts detaches explicitly
-- (only while the application is open) before removing bytes.

-- CreateEnum
CREATE TYPE "KycIdDocumentType" AS ENUM ('national_id', 'other_document');

-- CreateEnum
CREATE TYPE "KycRelationship" AS ENUM ('owner', 'broker_agent', 'other_associated');

-- CreateEnum
CREATE TYPE "KycReviewState" AS ENUM ('pending', 'more_info', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "KycPayoutMethod" AS ENUM ('mobile_money');

-- CreateTable
CREATE TABLE "landlord_kyc" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "id_document_type" "KycIdDocumentType" NOT NULL DEFAULT 'national_id',
    "age_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "id_front_media_id" TEXT,
    "id_back_media_id" TEXT,
    "selfie_media_id" TEXT,
    "identity_state" "KycReviewState" NOT NULL DEFAULT 'pending',
    "identity_review_note" TEXT,
    "relationship" "KycRelationship" NOT NULL DEFAULT 'owner',
    "property_id" TEXT,
    "title_particulars" TEXT,
    "ownership_evidence_media_id" TEXT,
    "property_photos" JSONB,
    "authority_explanation" TEXT,
    "authority_state" "KycReviewState" NOT NULL DEFAULT 'pending',
    "authority_review_note" TEXT,
    "payout_recipient_name" TEXT,
    "payout_method" "KycPayoutMethod",
    "payout_destination" TEXT,
    "payout_state" "KycReviewState" NOT NULL DEFAULT 'pending',
    "payout_review_note" TEXT,
    "declarations" JSONB NOT NULL,
    "terms_version" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_reviewed_by_party_id" TEXT,
    "last_reviewed_at" TIMESTAMP(3),

    CONSTRAINT "landlord_kyc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "landlord_kyc_party_id_submitted_at_idx" ON "landlord_kyc"("party_id", "submitted_at");

-- CreateIndex
CREATE INDEX "landlord_kyc_identity_state_idx" ON "landlord_kyc"("identity_state");

-- CreateIndex
CREATE INDEX "landlord_kyc_authority_state_idx" ON "landlord_kyc"("authority_state");

-- CreateIndex
CREATE INDEX "landlord_kyc_payout_state_idx" ON "landlord_kyc"("payout_state");


-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_id_front_media_id_fkey" FOREIGN KEY ("id_front_media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_id_back_media_id_fkey" FOREIGN KEY ("id_back_media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_selfie_media_id_fkey" FOREIGN KEY ("selfie_media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_ownership_evidence_media_id_fkey" FOREIGN KEY ("ownership_evidence_media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landlord_kyc" ADD CONSTRAINT "landlord_kyc_last_reviewed_by_party_id_fkey" FOREIGN KEY ("last_reviewed_by_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;
