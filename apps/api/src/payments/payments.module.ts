import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER } from './interfaces/payment-provider.interface';
import { LedgerModule } from '../ledger/ledger.module';

/**
 * Company-level Payments module (Technical Architecture §4.1, §5.2). The
 * provider is bound by DI token, so swapping MockPaymentProvider for the
 * licensed PSP is a one-line change here and nothing else moves.
 */
@Module({
  imports: [LedgerModule],
  providers: [
    PaymentsService,
    MockPaymentProvider,
    { provide: PAYMENT_PROVIDER, useExisting: MockPaymentProvider },
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER, MockPaymentProvider],
})
export class PaymentsModule {}
