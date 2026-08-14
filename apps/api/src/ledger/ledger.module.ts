import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { EscrowService } from './escrow.service';

/**
 * Payments module — the double-entry ledger and the escrow orchestration
 * primitives built on it (Technical Architecture §5). Product-agnostic:
 * knows parties, accounts, amounts and instructions, never "rent" or
 * "commission" as derived concepts.
 */
@Module({
  providers: [LedgerService, EscrowService],
  exports: [LedgerService, EscrowService],
})
export class LedgerModule {}
