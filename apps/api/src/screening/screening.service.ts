import { Inject, Injectable } from '@nestjs/common';
import { ScreeningModuleState, ScreeningOverallState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService, CONFIG_KEYS } from '../config/config.service';
import {
  SCREENING_MODULES,
  ScreeningModule,
} from './screening-module.interface';

export class UnknownScreeningModuleError extends Error {
  constructor(key: string, registered: string[]) {
    super(
      `screening_modules config names "${key}", which is not registered. ` +
        `Registered: [${registered.join(', ')}]. Failing loudly rather than ` +
        'silently skipping — a screening module that is configured but not ' +
        'running would mean tenants pass a check nobody performed.',
    );
    this.name = 'UnknownScreeningModuleError';
  }
}

/**
 * The modular screening pipeline (SSOT Decision 10, FR-6.1 – FR-6.3).
 *
 * ── The tenant flow never changes ──
 * `runScreening()` is the whole of the tenant-facing flow. It reads the
 * active module set from Config, resolves each key against the registered
 * modules, runs them, and records the outcome. Adding a module is a new
 * class plus a config edit; this method does not change, and neither does
 * anything calling it. That is FR-6.2 made structural rather than promised.
 *
 * ── Ability to pay is NOT here ──
 * It is evidenced by escrow funding (FR-6.3). No employment or financial
 * document is collected, stored, or modelled anywhere in V1.
 */
@Injectable()
export class ScreeningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(SCREENING_MODULES) private readonly modules: ScreeningModule[],
  ) {}

  /** The module keys currently switched on (V1: `['identity']`). */
  async activeModuleKeys(asOf?: Date): Promise<string[]> {
    return this.config.getValue<string[]>(CONFIG_KEYS.screeningModules, asOf);
  }

  /** Every module registered with the application, enabled or not. */
  registeredModuleKeys(): string[] {
    return this.modules.map((m) => m.key);
  }

  /**
   * Runs the configured pipeline for a tenant and records the result.
   *
   * The run snapshots `moduleSet` — what actually ran — so history stays
   * interpretable after the config changes. Without that, a run from before
   * a config edit would silently appear to have run today's module set.
   */
  async runScreening(params: {
    tenantPartyId: string;
    dealId?: string;
    asOf?: Date;
  }) {
    const activeKeys = await this.activeModuleKeys(params.asOf);

    // Resolve first, run second: an unknown key is a configuration error and
    // must stop the run, not quietly reduce what gets checked.
    const toRun = activeKeys.map((key) => {
      const found = this.modules.find((m) => m.key === key);
      if (!found) {
        throw new UnknownScreeningModuleError(key, this.registeredModuleKeys());
      }
      return found;
    });

    const run = await this.prisma.screeningRun.create({
      data: {
        tenantPartyId: params.tenantPartyId,
        dealId: params.dealId,
        moduleSet: activeKeys,
        overallState: 'pending',
      },
    });

    const outcomes: { key: string; state: ScreeningModuleState }[] = [];
    for (const module of toRun) {
      const outcome = await module.run({
        tenantPartyId: params.tenantPartyId,
        dealId: params.dealId,
      });

      await this.prisma.screeningModuleResult.create({
        data: {
          screeningRunId: run.id,
          moduleKey: module.key,
          state: outcome.state,
          detail: (outcome.detail ?? null) as never,
        },
      });
      outcomes.push({ key: module.key, state: outcome.state });
    }

    const overallState = this.resolveOverall(outcomes.map((o) => o.state));

    return this.prisma.screeningRun.update({
      where: { id: run.id },
      data: { overallState },
      include: { moduleResults: true },
    });
  }

  /**
   * A run passes only if every module that actually ran passed. `skipped`
   * does not block — a module can legitimately not apply — but it never
   * counts as a pass either. A run with nothing to judge stays `pending`
   * rather than defaulting to `passed`, because "no checks ran" must never
   * read as "cleared".
   */
  private resolveOverall(
    states: ScreeningModuleState[],
  ): ScreeningOverallState {
    if (states.some((s) => s === 'failed')) {
      return 'failed';
    }
    if (states.some((s) => s === 'pending')) {
      return 'pending';
    }
    const passed = states.filter((s) => s === 'passed');
    return passed.length > 0 ? 'passed' : 'pending';
  }

  async getRun(runId: string) {
    return this.prisma.screeningRun.findUnique({
      where: { id: runId },
      include: { moduleResults: true },
    });
  }

  /** The tenant's most recent run — what a landlord-facing surface reads. */
  async latestRunForTenant(tenantPartyId: string) {
    return this.prisma.screeningRun.findFirst({
      where: { tenantPartyId },
      orderBy: { createdAt: 'desc' },
      include: { moduleResults: true },
    });
  }
}
