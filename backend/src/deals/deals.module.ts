import { Module } from '@nestjs/common';
import { DealsService } from './deals.service';
import { DealsController } from './deals.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsModule } from '../payments/payments.module';

/**
 * Deals & Guarantee — the deal state machine and commission engine
 * (Data_Model.md §7). Orchestrates Payments on transitions; the Move-In
 * Guarantee is the shape of the transition graph, not a separate feature.
 */
@Module({
  imports: [LedgerModule, PaymentsModule],
  controllers: [DealsController],
  providers: [DealsService],
  exports: [DealsService],
})
export class DealsModule {}
