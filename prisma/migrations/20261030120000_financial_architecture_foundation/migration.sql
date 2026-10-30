-- Financial architecture foundation (2026-10-30) — ADDITIVE ONLY.
--
-- Safe-by-construction: new enum values (no existing value changes meaning,
-- no row migrates), nullable columns on deal/listing, and six NEW tables.
-- No UPDATE, no DELETE, no ALTER of an existing column, no data backfill.
-- ledger_entry / psp_instruction / deal_transition etc. are untouched (the
-- production immutability triggers are unaffected — DDL here only ADDs).
--
-- Postgres 12+ required (multiple ALTER TYPE ... ADD VALUE in one
-- transaction); Supabase runs 15+. Apply ONLY via scripts/apply-migration.mjs
-- with the two-key rails (TARGET_DATABASE_URL + ALLOW_PROD_MIGRATION=yes).
--
-- Full design: docs/FINANCIAL_ARCHITECTURE.md.
-- Commission moves to confirmed-payment; rent and deposit get separate
-- ledger classifications; move-in verification, deposit deductions, refunds,
-- adjustments and post-settlement landlord refund coordination become
-- first-class records.

-- CreateEnum
CREATE TYPE "MoveInVerificationState" AS ENUM ('open', 'tenant_confirmed', 'landlord_confirmed', 'disputed', 'under_review', 'verified', 'not_verified');

-- CreateEnum
CREATE TYPE "DepositCaseState" AS ENUM ('held', 'deduction_proposed', 'under_review', 'partially_released', 'closed');

-- CreateEnum
CREATE TYPE "DepositDeductionState" AS ENUM ('proposed', 'under_review', 'accepted_by_tenant', 'disputed_by_tenant', 'approved', 'rejected', 'applied', 'withdrawn');

-- CreateEnum
CREATE TYPE "RefundKind" AS ENUM ('full_pre_settlement', 'partial_pre_settlement', 'duplicate_payment', 'deposit_refund', 'commission_reversal_payout');

-- CreateEnum
CREATE TYPE "RefundState" AS ENUM ('pending', 'confirmed', 'failed');

-- CreateEnum
CREATE TYPE "FinancialAdjustmentKind" AS ENUM ('commission_reversal', 'provider_reversal', 'correction', 'fee_correction');

-- CreateEnum
CREATE TYPE "PostSettlementRefundState" AS ENUM ('recorded', 'landlord_acknowledged', 'coordinating', 'resolved_paid_by_landlord', 'resolved_waived_by_tenant', 'escalated');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DealStatus" ADD VALUE 'payment_pending';
ALTER TYPE "DealStatus" ADD VALUE 'move_in_awaiting_verification';
ALTER TYPE "DealStatus" ADD VALUE 'move_in_disputed';
ALTER TYPE "DealStatus" ADD VALUE 'settlement_pending';
ALTER TYPE "DealStatus" ADD VALUE 'refund_pending';
ALTER TYPE "DealStatus" ADD VALUE 'partially_refunded';
ALTER TYPE "DealStatus" ADD VALUE 'financial_review_required';
ALTER TYPE "DealStatus" ADD VALUE 'reversed';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LedgerAccountType" ADD VALUE 'rent_escrow_liability';
ALTER TYPE "LedgerAccountType" ADD VALUE 'deposit_liability';
ALTER TYPE "LedgerAccountType" ADD VALUE 'psp_fee_expense';

-- AlterTable
ALTER TABLE "listing" ADD COLUMN     "advance_mutual_agreement_ref" TEXT;

-- AlterTable
ALTER TABLE "deal" ADD COLUMN     "advance_months_snapshot" INTEGER,
ADD COLUMN     "advance_rent_snapshot" BIGINT,
ADD COLUMN     "commission_payer_snapshot" TEXT,
ADD COLUMN     "deposit_amount_snapshot" BIGINT,
ADD COLUMN     "mutual_agreement_ref_snapshot" TEXT,
ADD COLUMN     "policy_snapshot" JSONB;

-- CreateTable
CREATE TABLE "move_in_verification" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "state" "MoveInVerificationState" NOT NULL DEFAULT 'open',
    "tenant_confirmed_at" TIMESTAMP(3),
    "tenant_note" TEXT,
    "tenant_evidence_ref" TEXT,
    "landlord_confirmed_at" TIMESTAMP(3),
    "landlord_note" TEXT,
    "landlord_evidence_ref" TEXT,
    "disputed_by_party_id" TEXT,
    "dispute_reason" TEXT,
    "dispute_evidence_ref" TEXT,
    "dispute_opened_at" TIMESTAMP(3),
    "response_deadline" TIMESTAMP(3),
    "decided_by_party_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "officer_evidence_ref" TEXT,
    "officer_evidence_note" TEXT,
    "officer_evidence_at" TIMESTAMP(3),
    "officer_evidence_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "move_in_verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_case" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "state" "DepositCaseState" NOT NULL DEFAULT 'held',
    "custody_basis_ref" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "closed_reason" TEXT,

    CONSTRAINT "deposit_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_deduction" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "proposed_by_party_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_ref" TEXT,
    "state" "DepositDeductionState" NOT NULL DEFAULT 'proposed',
    "tenant_responded_at" TIMESTAMP(3),
    "tenant_response_note" TEXT,
    "reviewed_by_party_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_reason" TEXT,
    "applied_posting_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_deduction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_record" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "kind" "RefundKind" NOT NULL,
    "amount" BIGINT NOT NULL,
    "state" "RefundState" NOT NULL DEFAULT 'pending',
    "reason" TEXT NOT NULL,
    "requested_by_party_id" TEXT NOT NULL,
    "instruction_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_adjustment" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "kind" "FinancialAdjustmentKind" NOT NULL,
    "reason_category" TEXT,
    "reason" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "actor_party_id" TEXT NOT NULL,
    "actor_role" TEXT,
    "target_posting_id" TEXT,
    "resulting_posting_id" TEXT,
    "evidence_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_settlement_refund" (
    "id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "amount_claimed" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_party_id" TEXT NOT NULL,
    "state" "PostSettlementRefundState" NOT NULL DEFAULT 'recorded',
    "landlord_acknowledged_at" TIMESTAMP(3),
    "landlord_note" TEXT,
    "evidence_ref" TEXT,
    "resolution_note" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_party_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_settlement_refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "move_in_verification_deal_id_key" ON "move_in_verification"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_case_deal_id_key" ON "deposit_case"("deal_id");

-- CreateIndex
CREATE INDEX "deposit_deduction_case_id_idx" ON "deposit_deduction"("case_id");

-- CreateIndex
CREATE INDEX "refund_record_deal_id_idx" ON "refund_record"("deal_id");

-- CreateIndex
CREATE INDEX "financial_adjustment_deal_id_idx" ON "financial_adjustment"("deal_id");

-- CreateIndex
CREATE INDEX "post_settlement_refund_deal_id_idx" ON "post_settlement_refund"("deal_id");

-- AddForeignKey
ALTER TABLE "move_in_verification" ADD CONSTRAINT "move_in_verification_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_case" ADD CONSTRAINT "deposit_case_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_deduction" ADD CONSTRAINT "deposit_deduction_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "deposit_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_record" ADD CONSTRAINT "refund_record_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_adjustment" ADD CONSTRAINT "financial_adjustment_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_settlement_refund" ADD CONSTRAINT "post_settlement_refund_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

