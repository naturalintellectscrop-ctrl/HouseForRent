-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PartyStatus" AS ENUM ('active', 'suspended', 'closed');

-- CreateEnum
CREATE TYPE "AuthRole" AS ENUM ('tenant', 'lister', 'foo', 'admin');

-- CreateEnum
CREATE TYPE "ListerTier" AS ENUM ('property_owner', 'broker_agent', 'property_mgmt_company');

-- CreateEnum
CREATE TYPE "IdentityMethod" AS ENUM ('nin', 'phone', 'selfie_match');

-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('pending', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "MandateState" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ConfigValueType" AS ENUM ('int', 'json', 'text');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('apartment', 'house', 'room', 'other');

-- CreateEnum
CREATE TYPE "FurnishedState" AS ENUM ('furnished', 'semi_furnished', 'unfurnished');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('rental');

-- CreateEnum
CREATE TYPE "ListingTier" AS ENUM ('standard');

-- CreateEnum
CREATE TYPE "PublicationState" AS ENUM ('draft', 'awaiting_verification', 'live', 'rented', 'withdrawn');

-- CreateEnum
CREATE TYPE "ListingVerificationState" AS ENUM ('unverified', 'verified');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('available', 'unavailable');

-- CreateEnum
CREATE TYPE "ConductedByRole" AS ENUM ('foo');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('requested', 'scheduled', 'conducted', 'no_show', 'cancelled');

-- CreateEnum
CREATE TYPE "ConditionRating" AS ENUM ('excellent', 'good', 'fair', 'poor');

-- CreateEnum
CREATE TYPE "ScreeningOverallState" AS ENUM ('pending', 'passed', 'failed');

-- CreateEnum
CREATE TYPE "ScreeningModuleState" AS ENUM ('pending', 'passed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('created', 'tenant_matched', 'agreement_signed', 'escrow_funded', 'move_in_confirmed', 'commission_earned', 'settled', 'closed', 'cancelled', 'refunded', 'dispute_hold');

-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('escrow_liability', 'commission_receivable', 'commission_revenue', 'landlord_payable', 'psp_clearing');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "PspInstructionKind" AS ENUM ('collect', 'release', 'refund');

-- CreateEnum
CREATE TYPE "PspInstructionState" AS ENUM ('pending', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "party" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "primary_phone" TEXT NOT NULL,
    "status" "PartyStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "auth_role" "AuthRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lister_profile" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "tier" "ListerTier" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lister_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_verification" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "method" "IdentityMethod" NOT NULL,
    "state" "VerificationState" NOT NULL DEFAULT 'pending',
    "provider_ref" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "retention_until" TIMESTAMP(3),
    "policy_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_mandate" (
    "id" TEXT NOT NULL,
    "lister_party_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "evidence_media_id" TEXT,
    "state" "MandateState" NOT NULL DEFAULT 'pending',
    "verified_by_party_id" TEXT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_mandate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_parameter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_type" "ConfigValueType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_version" (
    "id" TEXT NOT NULL,
    "parameter_id" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_by_party_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rate_version" (
    "id" TEXT NOT NULL,
    "rate_bp_of_month" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_by_party_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rate_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighbourhood" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "in_service_area" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighbourhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property" (
    "id" TEXT NOT NULL,
    "owner_party_id" TEXT NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "furnished" "FurnishedState" NOT NULL,
    "neighbourhood_id" TEXT NOT NULL,
    "geo_lat" DOUBLE PRECISION,
    "geo_lng" DOUBLE PRECISION,
    "landmark_text" TEXT NOT NULL,
    "street_address" TEXT,
    "transaction_type" "TransactionType" NOT NULL DEFAULT 'rental',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "monthly_rent" BIGINT NOT NULL,
    "required_months_upfront" INTEGER NOT NULL,
    "deposit_amount" BIGINT NOT NULL,
    "tier" "ListingTier" NOT NULL DEFAULT 'standard',
    "publication_state" "PublicationState" NOT NULL DEFAULT 'draft',
    "verification_state" "ListingVerificationState" NOT NULL DEFAULT 'unverified',
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'available',
    "availability_confirmed_at" TIMESTAMP(3),
    "description_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "amenity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "amenity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_amenity" (
    "listing_id" TEXT NOT NULL,
    "amenity_id" TEXT NOT NULL,

    CONSTRAINT "listing_amenity_pkey" PRIMARY KEY ("listing_id","amenity_id")
);

-- CreateTable
CREATE TABLE "viewing" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "tenant_party_id" TEXT NOT NULL,
    "conducted_by_party_id" TEXT,
    "conducted_by_role" "ConductedByRole" NOT NULL DEFAULT 'foo',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "status" "ViewingStatus" NOT NULL DEFAULT 'requested',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "introduction_record" (
    "id" TEXT NOT NULL,
    "viewing_id" TEXT NOT NULL,
    "tenant_party_id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "landlord_party_id" TEXT NOT NULL,
    "foo_party_id" TEXT NOT NULL,
    "introduced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "introduction_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_report" (
    "id" TEXT NOT NULL,
    "viewing_id" TEXT NOT NULL,
    "foo_party_id" TEXT NOT NULL,
    "condition_rating" "ConditionRating" NOT NULL,
    "matches_listing" BOOLEAN NOT NULL,
    "is_available" BOOLEAN NOT NULL,
    "issues_text" TEXT,
    "timing_note" TEXT,
    "media_asset_ids" TEXT[],
    "reported_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_run" (
    "id" TEXT NOT NULL,
    "tenant_party_id" TEXT NOT NULL,
    "deal_id" TEXT,
    "overall_state" "ScreeningOverallState" NOT NULL DEFAULT 'pending',
    "module_set" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "screening_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_module_result" (
    "id" TEXT NOT NULL,
    "screening_run_id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "state" "ScreeningModuleState" NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_module_result_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "tenant_party_id" TEXT NOT NULL,
    "landlord_party_id" TEXT NOT NULL,
    "introduction_record_id" TEXT,
    "status" "DealStatus" NOT NULL DEFAULT 'created',
    "monthly_rent_snapshot" BIGINT,
    "commission_rate_bp_snapshot" INTEGER,
    "commission_rate_version_id" TEXT,
    "commission_amount" BIGINT,
    "agreement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_transition" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "actor_party_id" TEXT NOT NULL,
    "reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_account" (
    "id" TEXT NOT NULL,
    "account_type" "LedgerAccountType" NOT NULL,
    "owner_party_id" TEXT,
    "deal_id" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'UGX',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" TEXT NOT NULL,
    "posting_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" BIGINT NOT NULL,
    "deal_id" TEXT,
    "reference" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psp_instruction" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "kind" "PspInstructionKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider_ref" TEXT,
    "state" "PspInstructionState" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "psp_instruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_check" (
    "id" TEXT NOT NULL,
    "run_at" TIMESTAMP(3) NOT NULL,
    "ledger_balance" BIGINT NOT NULL,
    "psp_balance" BIGINT NOT NULL,
    "is_reconciled" BOOLEAN NOT NULL,
    "discrepancy_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_agreement" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "lister_party_id" TEXT NOT NULL,
    "commission_rate_version_id" TEXT NOT NULL,
    "monthly_rent_at_signing" BIGINT NOT NULL,
    "circumvention_clause_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" TEXT NOT NULL,
    "storage_ref" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "perceptual_hash" TEXT,
    "uploaded_by_party_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_party_id" TEXT NOT NULL,
    "subject_ref" TEXT,
    "payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "party_primary_phone_key" ON "party"("primary_phone");

-- CreateIndex
CREATE UNIQUE INDEX "lister_profile_party_id_key" ON "lister_profile"("party_id");

-- CreateIndex
CREATE INDEX "identity_verification_party_id_method_idx" ON "identity_verification"("party_id", "method");

-- CreateIndex
CREATE UNIQUE INDEX "property_mandate_lister_party_id_property_id_key" ON "property_mandate"("lister_party_id", "property_id");

-- CreateIndex
CREATE UNIQUE INDEX "config_parameter_key_key" ON "config_parameter"("key");

-- CreateIndex
CREATE INDEX "config_version_parameter_id_effective_from_idx" ON "config_version"("parameter_id", "effective_from");

-- CreateIndex
CREATE INDEX "commission_rate_version_effective_from_idx" ON "commission_rate_version"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "amenity_name_key" ON "amenity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "introduction_record_viewing_id_key" ON "introduction_record"("viewing_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_report_viewing_id_key" ON "field_report"("viewing_id");

-- CreateIndex
CREATE INDEX "ledger_entry_posting_id_idx" ON "ledger_entry"("posting_id");

-- CreateIndex
CREATE INDEX "ledger_entry_account_id_idx" ON "ledger_entry"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "psp_instruction_idempotency_key_key" ON "psp_instruction"("idempotency_key");

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lister_profile" ADD CONSTRAINT "lister_profile_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verification" ADD CONSTRAINT "identity_verification_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandate" ADD CONSTRAINT "property_mandate_lister_party_id_fkey" FOREIGN KEY ("lister_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandate" ADD CONSTRAINT "property_mandate_verified_by_party_id_fkey" FOREIGN KEY ("verified_by_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandate" ADD CONSTRAINT "property_mandate_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandate" ADD CONSTRAINT "property_mandate_evidence_media_id_fkey" FOREIGN KEY ("evidence_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_parameter_id_fkey" FOREIGN KEY ("parameter_id") REFERENCES "config_parameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "config_version" ADD CONSTRAINT "config_version_created_by_party_id_fkey" FOREIGN KEY ("created_by_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rate_version" ADD CONSTRAINT "commission_rate_version_created_by_party_id_fkey" FOREIGN KEY ("created_by_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighbourhood" ADD CONSTRAINT "neighbourhood_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "neighbourhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property" ADD CONSTRAINT "property_owner_party_id_fkey" FOREIGN KEY ("owner_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property" ADD CONSTRAINT "property_neighbourhood_id_fkey" FOREIGN KEY ("neighbourhood_id") REFERENCES "neighbourhood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing" ADD CONSTRAINT "listing_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_amenity" ADD CONSTRAINT "listing_amenity_amenity_id_fkey" FOREIGN KEY ("amenity_id") REFERENCES "amenity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing" ADD CONSTRAINT "viewing_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing" ADD CONSTRAINT "viewing_tenant_party_id_fkey" FOREIGN KEY ("tenant_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "viewing" ADD CONSTRAINT "viewing_conducted_by_party_id_fkey" FOREIGN KEY ("conducted_by_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_record" ADD CONSTRAINT "introduction_record_viewing_id_fkey" FOREIGN KEY ("viewing_id") REFERENCES "viewing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_record" ADD CONSTRAINT "introduction_record_tenant_party_id_fkey" FOREIGN KEY ("tenant_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_record" ADD CONSTRAINT "introduction_record_landlord_party_id_fkey" FOREIGN KEY ("landlord_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_record" ADD CONSTRAINT "introduction_record_foo_party_id_fkey" FOREIGN KEY ("foo_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "introduction_record" ADD CONSTRAINT "introduction_record_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_viewing_id_fkey" FOREIGN KEY ("viewing_id") REFERENCES "viewing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_report" ADD CONSTRAINT "field_report_foo_party_id_fkey" FOREIGN KEY ("foo_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_run" ADD CONSTRAINT "screening_run_tenant_party_id_fkey" FOREIGN KEY ("tenant_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_run" ADD CONSTRAINT "screening_run_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_module_result" ADD CONSTRAINT "screening_module_result_screening_run_id_fkey" FOREIGN KEY ("screening_run_id") REFERENCES "screening_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_tenant_party_id_fkey" FOREIGN KEY ("tenant_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_landlord_party_id_fkey" FOREIGN KEY ("landlord_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_introduction_record_id_fkey" FOREIGN KEY ("introduction_record_id") REFERENCES "introduction_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_commission_rate_version_id_fkey" FOREIGN KEY ("commission_rate_version_id") REFERENCES "commission_rate_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal" ADD CONSTRAINT "deal_agreement_id_fkey" FOREIGN KEY ("agreement_id") REFERENCES "listing_agreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_transition" ADD CONSTRAINT "deal_transition_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_transition" ADD CONSTRAINT "deal_transition_actor_party_id_fkey" FOREIGN KEY ("actor_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_owner_party_id_fkey" FOREIGN KEY ("owner_party_id") REFERENCES "party"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "psp_instruction" ADD CONSTRAINT "psp_instruction_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_agreement" ADD CONSTRAINT "listing_agreement_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_agreement" ADD CONSTRAINT "listing_agreement_lister_party_id_fkey" FOREIGN KEY ("lister_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_agreement" ADD CONSTRAINT "listing_agreement_commission_rate_version_id_fkey" FOREIGN KEY ("commission_rate_version_id") REFERENCES "commission_rate_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_party_id_fkey" FOREIGN KEY ("uploaded_by_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_actor_party_id_fkey" FOREIGN KEY ("actor_party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

