import { Injectable } from '@nestjs/common';
import { ConfigValueType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Versioned, effective-dated configuration (Data_Model.md §3.1, FR-10.1).
 *
 * ── Why this exists as a module rather than a constants file ──
 * PRD §1.5 lists the commission rate, launch gate, corridor, freshness
 * window and required-months as things validation will MOVE. They are
 * parameters, not architecture. Serving them from a versioned store means a
 * change is a data change with an audit trail, not a code deployment — and
 * `config_version` is immutable, so a change is a new version and history
 * stays interpretable.
 *
 * Money-touching config does NOT live here: the commission rate has its own
 * `commission_rate_version` table and is consumed by *snapshot* onto the
 * deal, never by live lookup (Technical Architecture §4.1). That separation
 * is what makes in-flight deals structurally immune to a rate change.
 */

/** Config keys used in V1. Adding one is a data change plus a key here. */
export const CONFIG_KEYS = {
  serviceArea: 'service_area',
  freshnessWindowDays: 'freshness_window_days',
  screeningModules: 'screening_modules',
  launchGateCount: 'launch_gate_count',
  requiredMonthsDefault: 'required_months_default',
} as const;

export class ConfigNotSetError extends Error {
  constructor(key: string) {
    super(
      `configuration "${key}" has no effective version. It must be seeded ` +
        'before use — this deliberately does not fall back to a hardcoded ' +
        'default, because a silent default is how an unvalidated business ' +
        'parameter becomes permanent by accident (PRD §1.5).',
    );
    this.name = 'ConfigNotSetError';
  }
}

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** Defines a parameter. Idempotent — safe to call at startup. */
  async defineParameter(key: string, valueType: ConfigValueType) {
    const existing = await this.prisma.configParameter.findUnique({
      where: { key },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.configParameter.create({ data: { key, valueType } });
  }

  /**
   * Sets a new value by creating a NEW immutable version. Never mutates an
   * existing one, so the history of what was in force when remains readable.
   */
  async setValue(params: {
    key: string;
    value: unknown;
    createdByPartyId: string;
    effectiveFrom?: Date;
  }) {
    const parameter = await this.prisma.configParameter.findUniqueOrThrow({
      where: { key: params.key },
    });
    return this.prisma.configVersion.create({
      data: {
        parameterId: parameter.id,
        value: params.value as never,
        effectiveFrom: params.effectiveFrom ?? new Date(),
        createdByPartyId: params.createdByPartyId,
      },
    });
  }

  /**
   * The value in force at `asOf` — the latest version whose effectiveFrom
   * has passed. Future-dated versions are invisible until their time comes,
   * which is what makes a scheduled change safe to stage in advance.
   *
   * Throws rather than returning a default when unset: a silent fallback
   * would let an unvalidated parameter (PRD §1.5) become permanent without
   * anyone deciding it.
   */
  async getValue<T>(key: string, asOf?: Date): Promise<T> {
    const at = asOf ?? new Date();
    const parameter = await this.prisma.configParameter.findUnique({
      where: { key },
      include: {
        versions: {
          where: { effectiveFrom: { lte: at } },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
        },
      },
    });

    const version = parameter?.versions[0];
    if (!version) {
      throw new ConfigNotSetError(key);
    }
    return version.value as T;
  }

  /** The freshness window in days (FR-2.3). */
  async freshnessWindowDays(asOf?: Date): Promise<number> {
    return this.getValue<number>(CONFIG_KEYS.freshnessWindowDays, asOf);
  }

  /** Full version history for a key — the audit trail (FR-10.1). */
  async history(key: string) {
    const parameter = await this.prisma.configParameter.findUniqueOrThrow({
      where: { key },
      include: { versions: { orderBy: { effectiveFrom: 'desc' } } },
    });
    return parameter.versions;
  }
}
