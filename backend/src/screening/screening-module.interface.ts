import { ScreeningModuleState } from '@prisma/client';

/**
 * The contract every screening module implements (FR-6.1, FR-6.2).
 *
 * ── Why this shape ──
 * "Identity-only" is a CONFIGURATION of this pipeline, never the whole of
 * screening (SSOT Decision 10). The pipeline discovers which modules to run
 * from Config at runtime and calls each through this one interface, so
 * adding employment / references / rental-history / risk-scoring later is a
 * new class plus a config edit — the tenant flow itself does not change.
 * A test proves exactly that by enabling a stub module purely by config.
 *
 * ── What a module may NOT do ──
 * Modules return a verdict and structured `detail`. They do not write
 * `screening_module_result` rows themselves, do not decide the overall
 * outcome, and do not know about each other. Keeping that authority in the
 * pipeline is what stops a future module from quietly changing how
 * screening as a whole behaves.
 */
export interface ScreeningModuleContext {
  tenantPartyId: string;
  dealId?: string;
}

export interface ScreeningModuleOutcome {
  state: ScreeningModuleState;
  /**
   * Structured, JSON-serialisable evidence of the decision. MUST NOT carry
   * raw personal data — DPA 2019 minimisation applies here as much as in
   * Identity (NFR-3). Identity, for example, records which methods were
   * verified, never the NIN itself.
   */
  detail?: Record<string, unknown>;
}

export interface ScreeningModule {
  /**
   * Stable identifier, persisted as `screening_module_result.module_key`
   * and referenced by the `screening_modules` config value. Changing a
   * published key would orphan historical rows, so treat it as permanent.
   */
  readonly key: string;

  run(context: ScreeningModuleContext): Promise<ScreeningModuleOutcome>;
}

/** DI token for the set of modules registered in the application. */
export const SCREENING_MODULES = Symbol('SCREENING_MODULES');
