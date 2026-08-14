import { Injectable } from '@nestjs/common';
import { IdentityService } from '../../identity/identity.service';
import {
  ScreeningModule,
  ScreeningModuleContext,
  ScreeningModuleOutcome,
} from '../screening-module.interface';

/**
 * The only screening module active in V1 (SSOT Decision 10, FR-6.1).
 *
 * Delegates entirely to the Stage 1 Identity service rather than
 * reimplementing the three-factor check — screening asks a question,
 * Identity owns the answer. That keeps Identity reusable as a company-level
 * service and stops the same rule existing in two places where they could
 * drift apart.
 *
 * Records only WHICH methods verified, never the underlying values: no NIN,
 * no phone number, no selfie reference (DPA 2019 minimisation, NFR-3).
 */
@Injectable()
export class IdentityScreeningModule implements ScreeningModule {
  readonly key = 'identity';

  constructor(private readonly identity: IdentityService) {}

  async run(context: ScreeningModuleContext): Promise<ScreeningModuleOutcome> {
    const verified = await this.identity.isIdentityVerified(
      context.tenantPartyId,
    );

    return {
      state: verified ? 'passed' : 'failed',
      detail: {
        requiredMethods: ['nin', 'phone', 'selfie_match'],
        allVerified: verified,
      },
    };
  }
}
