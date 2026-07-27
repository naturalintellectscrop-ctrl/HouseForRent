-- AlterTable
ALTER TABLE "psp_instruction" DROP COLUMN "updated_at";

-- CreateTable
CREATE TABLE "psp_instruction_event" (
    "id" TEXT NOT NULL,
    "instruction_id" TEXT NOT NULL,
    "to_state" "PspInstructionState" NOT NULL,
    "provider_ref" TEXT,
    "detail" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "psp_instruction_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "psp_instruction_event_instruction_id_idx" ON "psp_instruction_event"("instruction_id");

-- CreateIndex
CREATE UNIQUE INDEX "psp_instruction_event_instruction_id_to_state_key" ON "psp_instruction_event"("instruction_id", "to_state");

-- AddForeignKey
ALTER TABLE "psp_instruction_event" ADD CONSTRAINT "psp_instruction_event_instruction_id_fkey" FOREIGN KEY ("instruction_id") REFERENCES "psp_instruction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- psp_instruction_event is append-only: it is the lifecycle audit trail for
-- a money instruction to the custodian, so an event, once recorded, is a
-- historical fact. Uses the same reject_mutation() trigger function as the
-- other immutable tables (migration 20260727150100_immutable_tables).
CREATE TRIGGER psp_instruction_event_immutable
  BEFORE UPDATE OR DELETE ON "psp_instruction_event"
  FOR EACH ROW EXECUTE FUNCTION reject_mutation();
