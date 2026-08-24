import { Module } from '@nestjs/common';
import { ScreeningService } from './screening.service';
import { OnboardingService } from './onboarding.service';
import { IdentityScreeningModule } from './modules/identity-screening.module';
import { EmploymentStubModule } from './modules/employment-stub.module';
import { SCREENING_MODULES } from './screening-module.interface';
import { IdentityModule } from '../identity/identity.module';
import { ScreeningController } from './screening.controller';

/**
 * Screening & tenant onboarding.
 *
 * Every module is REGISTERED here; which ones actually RUN comes from the
 * `screening_modules` config value at runtime. That split is the seam:
 * `EmploymentStubModule` is registered and inert today, and enabling it
 * requires editing config only — no change here, and none in the tenant
 * flow (FR-6.2).
 */
@Module({
  imports: [IdentityModule],
  controllers: [ScreeningController],
  providers: [
    ScreeningService,
    OnboardingService,
    IdentityScreeningModule,
    EmploymentStubModule,
    {
      provide: SCREENING_MODULES,
      useFactory: (
        identity: IdentityScreeningModule,
        employment: EmploymentStubModule,
      ) => [identity, employment],
      inject: [IdentityScreeningModule, EmploymentStubModule],
    },
  ],
  exports: [ScreeningService, OnboardingService],
})
export class ScreeningModule {}
