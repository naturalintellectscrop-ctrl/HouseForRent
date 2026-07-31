import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DealStatus } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { AdminService } from './admin.service';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import type { AuthenticatedCaller } from '../auth/auth.service';

export class CreateConfigVersionDto {
  /** Any JSON value — config parameters are typed by their parameter row. */
  value!: unknown;

  @IsOptional() @IsISO8601() effectiveFrom?: string;
}

export class CreateRateVersionDto {
  /**
   * Basis points of ONE MONTH's rent (10000 = 1.0 month). Integer, because
   * every downstream calculation is integer shillings and a fractional rate
   * would reintroduce the float this whole core exists to exclude.
   *
   * Capped at 3 months: not a business rule, a fat-finger guard. A rate
   * beyond it is almost certainly a typo, and the cost of that typo is
   * every deal signed before someone notices.
   */
  @IsInt() @Min(1) @Max(30000) rateBpOfMonth!: number;

  @IsOptional() @IsISO8601() effectiveFrom?: string;
  @IsOptional() @IsString() note?: string;
}

const DEAL_STATUSES: DealStatus[] = [
  'created',
  'tenant_matched',
  'agreement_signed',
  'escrow_funded',
  'move_in_confirmed',
  'commission_earned',
  'settled',
  'closed',
  'cancelled',
  'refunded',
  'dispute_hold',
];

export class DealStatesQueryDto {
  @IsOptional() @IsIn(DEAL_STATUSES) status?: DealStatus;
}

/**
 * Admin & ops observability (PRD E10, API Spec §9.3, §10).
 *
 * Note what is absent, deliberately: no endpoint edits a ledger entry, a
 * rate version, a config version or a deal status. Both write endpoints
 * here CREATE VERSIONS. There is no PUT or PATCH anywhere in this
 * controller, because an admin console powerful enough to rewrite the books
 * is one that can destroy the audit trail it exists to display (API Spec
 * §10).
 *
 * `launch-gate` and `verification-queue` are FOO-readable per §4.4 — they
 * are operational dispatch information. Everything touching money or
 * configuration is admin-only.
 */
@Controller('v1/admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** FR-10.3 — live verified inventory against the gate. */
  @Roles('foo', 'admin')
  @Get('launch-gate')
  async launchGate() {
    return this.admin.launchGate();
  }

  /** FR-10.2 — properties awaiting verification, with what blocks each. */
  @Roles('foo', 'admin')
  @Get('verification-queue')
  async verificationQueue() {
    return this.admin.verificationQueue();
  }

  /** FR-10.4 — ledger ↔ custodian reconciliation. Admin-only: it is money. */
  @Roles('admin')
  @Get('reconciliation')
  async reconciliation() {
    return this.admin.reconciliation();
  }

  /** FR-10.4 — deal-state distribution. */
  @Roles('admin')
  @Get('deals')
  async deals(@Query() query: DealStatesQueryDto) {
    return this.admin.dealStates(query.status);
  }

  /** NFR-2 — the audit trail for one subject (a deal, listing, config key). */
  @Roles('admin')
  @Get('audit/:subjectRef')
  async auditTrail(@Param('subjectRef') subjectRef: string) {
    return this.admin.auditTrail(subjectRef);
  }

  /** FR-10.1 — version history for a config key. */
  @Roles('admin')
  @Get('config/:key/versions')
  async configHistory(@Param('key') key: string) {
    return this.admin.configHistory(key);
  }

  /** FR-10.1 — a config change is a NEW version, never an edit. */
  @Roles('admin')
  @Post('config/:key/versions')
  async createConfigVersion(
    @Param('key') key: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CreateConfigVersionDto,
  ) {
    return this.admin.setConfigValue({
      key,
      value: dto.value,
      actorPartyId: caller.partyId,
      effectiveFrom: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : undefined,
    });
  }

  /**
   * FR-10.1 / FR-7.4 — a rate change is a NEW version. In-flight deals hold
   * snapshots and are structurally unaffected.
   */
  @Roles('admin')
  @Post('commission-rates')
  async createRateVersion(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CreateRateVersionDto,
  ) {
    return this.admin.createCommissionRateVersion({
      rateBpOfMonth: dto.rateBpOfMonth,
      actorPartyId: caller.partyId,
      effectiveFrom: dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : undefined,
      note: dto.note,
    });
  }
}
