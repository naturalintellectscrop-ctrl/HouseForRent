import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { PaymentsModule } from '../payments/payments.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Admin & ops observability (PRD E10). Reads across modules rather than
 * owning tables of its own — an admin surface that kept its own copy of
 * deal or ledger state would be a second source of truth, and the wrong one
 * whenever they disagreed.
 */
@Module({
  imports: [PaymentsModule, LedgerModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
