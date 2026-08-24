import { Module } from '@nestjs/common';
import { AgreementsService } from './agreements.service';
import {
  AgreementsController,
  CommissionRateController,
} from './agreements.controller';
import { AuditModule } from '../audit/audit.module';

/**
 * Listing agreements (Data_Model.md §9, FR-9.1, FR-9.2) — where the
 * commission rate snapshot originates.
 */
@Module({
  imports: [AuditModule],
  controllers: [AgreementsController, CommissionRateController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
