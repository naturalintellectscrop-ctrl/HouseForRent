import { Module } from '@nestjs/common';
import { ViewingsService } from './viewings.service';
import { ViewingsController } from './viewings.controller';
import { IdentityModule } from '../identity/identity.module';
import { MediaModule } from '../media/media.module';
import { AuditModule } from '../audit/audit.module';

/**
 * Viewings & field operations (Data_Model.md §5, PRD FR-5.x).
 *
 * Calls Identity for the tenant's verification state and Media for the
 * capture ladder rather than reimplementing either — the same delegation
 * ListingsService uses for mandates, for the same reason: a rule with two
 * copies is a rule that will drift.
 */
@Module({
  imports: [IdentityModule, MediaModule, AuditModule],
  controllers: [ViewingsController],
  providers: [ViewingsService],
  exports: [ViewingsService],
})
export class ViewingsModule {}
