import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { DealsService } from './deals.service';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import { RequiresDealParty } from '../auth/deal-party.decorator';
import { DealPartyGuard } from '../auth/guards/deal-party.guard';
import type { AuthenticatedCaller } from '../auth/auth.service';
import {
  CancelDealDto,
  DisputeHoldDto,
  FundEscrowDto,
  RefundDto,
  SettleDto,
  SignAgreementDto,
  TransitionDto,
} from './dto/deal.dto';

/**
 * The deal transitions of Data_Model.md §7.3, exposed as one endpoint per
 * legal transition — and NO others (API Spec §5.1).
 *
 * There is deliberately no `PATCH /deals/{id}` and no endpoint that accepts
 * a target status. Illegal transitions are therefore not merely rejected,
 * they are UNREPRESENTABLE: no request a client can construct expresses
 * "escrow_funded → settled", because no endpoint accepts that intent.
 *
 * Two absences carry the guarantees:
 *   - no settle-from-funded endpoint  → the Move-In Guarantee (FR-8.2)
 *   - no cancel-from-funded endpoint  → Amendment A1
 */
@Controller('v1/deals')
@UseGuards(DealPartyGuard)
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  /** created → tenant_matched. FOO/admin only: it asserts an introduction. */
  @Roles('foo', 'admin')
  @Post(':dealId/match-tenant')
  async matchTenant(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: TransitionDto,
  ) {
    return this.deals.matchTenant({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  /** tenant_matched → agreement_signed. THE SNAPSHOT POINT (FR-7.4). */
  @Roles('lister', 'admin')
  @RequiresDealParty()
  @Post(':dealId/sign-agreement')
  async signAgreement(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: SignAgreementDto,
  ) {
    return this.deals.signAgreement({
      dealId,
      actorPartyId: caller.partyId,
      agreementId: dto.agreementId,
      reason: dto.reason,
    });
  }

  /**
   * agreement_signed → escrow_funded. The tenant sends only the amount they
   * are paying; every derived figure (commission, net) is server-computed
   * from the deal's own snapshots (API Spec §7.1).
   */
  @Roles('tenant', 'admin')
  @RequiresDealParty()
  @Post(':dealId/fund-escrow')
  async fundEscrow(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: FundEscrowDto,
  ) {
    return this.deals.fundEscrow({
      dealId,
      actorPartyId: caller.partyId,
      amount: BigInt(dto.amount),
      reason: dto.reason,
    });
  }

  /**
   * escrow_funded → move_in_confirmed. TENANT-triggered by design: this is
   * what releases the tenant's own money from protection, so the party
   * whose funds are at risk is the one who says the condition is met. A
   * landlord-confirmed move-in would let the beneficiary unlock the escrow.
   */
  @Roles('tenant', 'admin')
  @RequiresDealParty()
  @Post(':dealId/confirm-move-in')
  async confirmMoveIn(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: TransitionDto,
  ) {
    return this.deals.confirmMoveIn({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  /**
   * move_in_confirmed → commission_earned. Admin-only: recognising revenue
   * is an accounting event the company performs, not a user action.
   */
  @Roles('admin')
  @Post(':dealId/earn-commission')
  async earnCommission(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: TransitionDto,
  ) {
    return this.deals.earnCommission({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  /**
   * commission_earned → settled. Admin-only: exposing this to a landlord
   * would let the party who benefits trigger their own payout.
   */
  @Roles('admin')
  @Post(':dealId/settle')
  async settle(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: SettleDto,
  ) {
    return this.deals.settle({
      dealId,
      actorPartyId: caller.partyId,
      totalHeld: BigInt(dto.totalHeld),
      landlordAccount: dto.landlordAccount,
      reason: dto.reason,
    });
  }

  @Roles('admin')
  @Post(':dealId/close')
  async close(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: TransitionDto,
  ) {
    return this.deals.close({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  /** escrow_funded → refunded. Full tenant refund (FR-7.7). */
  @Roles('admin')
  @Post(':dealId/refund')
  async refund(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: RefundDto,
  ) {
    return this.deals.refund({
      dealId,
      actorPartyId: caller.partyId,
      amount: BigInt(dto.amount),
      tenantAccount: dto.tenantAccount,
      reason: dto.reason,
    });
  }

  /** Pre-funding cancel only — a funded deal must route via refund (A1). */
  @Roles('lister', 'admin')
  @RequiresDealParty()
  @Post(':dealId/cancel')
  async cancel(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CancelDealDto,
  ) {
    return this.deals.cancel({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  @Roles('admin')
  @Post(':dealId/dispute-hold')
  async disputeHold(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: DisputeHoldDto,
  ) {
    return this.deals.placeOnDisputeHold({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  @Roles('admin')
  @Post(':dealId/resolve-dispute')
  async resolveDispute(
    @Param('dealId') dealId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: TransitionDto,
  ) {
    return this.deals.resolveDisputeToPriorStatus({
      dealId,
      actorPartyId: caller.partyId,
      reason: dto.reason,
    });
  }

  /**
   * The caller's own deals — every deal they are a party to.
   *
   * Scoped from the SESSION, never from a query parameter: an endpoint that
   * accepted a party id would let any authenticated user read anyone's
   * rentals, which the per-deal guard exists to prevent. Declared before
   * `:dealId` so the empty path is not matched as an id.
   */
  @Get()
  async myDeals(@Caller() caller: AuthenticatedCaller) {
    return this.deals.findForParty(caller.partyId);
  }

  /** Parties and staff only (API Spec §7.4 — non-parties get 404). */
  @RequiresDealParty()
  @Get(':dealId')
  async getDeal(@Param('dealId') dealId: string) {
    const deal = await this.deals.getDeal(dealId);
    const transitions = await this.deals.getTransitionHistory(dealId);
    return { deal, transitions };
  }
}
