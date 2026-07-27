import { Injectable } from '@nestjs/common';
import {
  ScreeningModule,
  ScreeningModuleContext,
  ScreeningModuleOutcome,
} from '../screening-module.interface';

/**
 * A present-but-DISABLED stub, existing solely to prove FR-6.2's seam: it
 * is registered with the pipeline yet never runs, because the V1
 * `screening_modules` config value is `['identity']`. Enabling it is a
 * config edit with no tenant-flow code change — asserted by test.
 *
 * ── This is a SEAM, not a feature ──
 * It deliberately collects and stores NOTHING. Employment verification is
 * explicitly post-V1 (SSOT §6), and V1 must not collect payslips, bank
 * statements or references in the standard flow (FR-6.3, Decision 10).
 * Ability-to-pay is evidenced by escrow funding instead — a tenant who has
 * funded the required months has demonstrated capacity more convincingly
 * than any forgeable document.
 *
 * When employment verification is actually built, this class is replaced by
 * a real implementation of the same interface. Building any part of it now
 * would be scaffolding a deferred feature, which the SSOT forbids.
 */
@Injectable()
export class EmploymentStubModule implements ScreeningModule {
  readonly key = 'employment';

  async run(_context: ScreeningModuleContext): Promise<ScreeningModuleOutcome> {
    return {
      state: 'skipped',
      detail: {
        reason:
          'stub module: employment verification is deferred to post-V1 ' +
          '(SSOT §6). No employment data is collected or stored.',
      },
    };
  }
}
