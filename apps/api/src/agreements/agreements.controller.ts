import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { AgreementsService } from './agreements.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import type { AuthenticatedCaller } from '../auth/auth.service';

/**
 * Note the absences: no `commissionRateBp`, no `monthlyRentAtSigning`, no
 * `accepted`. A lister accepts the terms the SERVER computed; a body that
 * could carry its own rate would let the payer choose what they pay
 * (FR-9.1, API Spec §7).
 */
export class AcceptAgreementDto {
  /**
   * The rate version the lister was shown. Optional in the DTO but always
   * sent by any honest client: if a rate change lands between presentation
   * and acceptance, this is what makes the server refuse rather than bind
   * the landlord to terms they never saw.
   */
  @IsOptional() @IsString() expectedRateVersionId?: string;

  @IsOptional() @IsString() clauseVersion?: string;
}

/**
 * [Amendment A3] API Spec §4.2 listed no agreement endpoints, yet FR-9.1
 * requires acceptance before a listing goes live and §11 does not name
 * agreements among the deliberate absences — a gap, not a prohibition.
 */
@Controller('v1/listings')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  /**
   * FR-9.1 — the terms, before accepting. Read-only, so a landlord can look
   * without being bound.
   *
   * Admin may read it too (support answering "what was I shown?"), but the
   * ACCEPTANCE below is lister-only: admin cannot sign a contract on a
   * landlord's behalf.
   */
  @Roles('lister', 'admin')
  @Get(':listingId/agreement')
  async terms(@Param('listingId') listingId: string) {
    return this.agreements.presentTerms(listingId);
  }

  /**
   * FR-9.1 — acceptance. Lister-only, and the service independently checks
   * that the caller owns the listing: holding the `lister` role is not the
   * same as being THIS listing's landlord.
   */
  @Roles('lister')
  @Post(':listingId/agreement/accept')
  async accept(
    @Param('listingId') listingId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: AcceptAgreementDto,
  ) {
    return this.agreements.accept({
      listingId,
      listerPartyId: caller.partyId,
      expectedRateVersionId: dto.expectedRateVersionId,
      clauseVersion: dto.clauseVersion,
    });
  }
}


/**
 * The published commercial term, on its own controller because it does not
 * live under `/v1/listings` — it is about the platform, not about any one
 * listing. Nest resolves a controller prefix literally, so this could not be
 * a relative path on the controller above.
 */
@Controller('v1')
export class CommissionRateController {
  constructor(private readonly agreements: AgreementsService) {}

  /**
   * The commission rate currently in force.
   *
   * ── Why this is public ──
   * It is a PUBLISHED commercial term, not a secret: the marketing pages
   * state what we charge landlords, and a rate stated in page copy is a
   * second copy of it — free to drift from the version that actually binds
   * the next agreement. Serving it from the same `rateInForce()` the
   * agreement snapshot uses means the website cannot advertise a rate the
   * system would not honour.
   *
   * It discloses the rate and nothing about any listing, landlord or deal.
   */
  @Public()
  @Get('commission-rate')
  async publicRate() {
    const rate = await this.agreements.rateInForce();
    return {
      rateBpOfMonth: rate.rateBpOfMonth,
      effectiveFrom: rate.effectiveFrom,
      versionId: rate.id,
    };
  }

}
