import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { MandateService } from './mandate.service';
import { MockIdentityProvider } from './mock-identity.provider';
import { IDENTITY_PROVIDER } from './interfaces/identity-provider.interface';

/**
 * Company-level Identity & Verification module (Technical Architecture
 * §4.1) — House For Rent is its first consumer. Exposes IdentityService
 * (who a party is) and MandateService (a lister's right to market a
 * specific property) as two separate services, deliberately not merged.
 */
@Module({
  providers: [
    IdentityService,
    MandateService,
    { provide: IDENTITY_PROVIDER, useClass: MockIdentityProvider },
  ],
  exports: [IdentityService, MandateService],
})
export class IdentityModule {}
