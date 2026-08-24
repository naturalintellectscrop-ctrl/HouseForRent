import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import type { AuthenticatedCaller } from '../auth/auth.service';
import {
  ConfirmAvailabilityDto,
  CreateListingDto,
  CreatePropertyDto,
} from './dto/listing.dto';

@Controller('v1')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  /** The owning party comes from the session, never the body (§7.3). */
  @Roles('lister', 'admin')
  @Post('properties')
  async createProperty(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CreatePropertyDto,
  ) {
    return this.listings.createProperty({
      ownerPartyId: caller.partyId,
      ...dto,
    });
  }

  /**
   * The caller's own listings, with what each is waiting on.
   *
   * Scoped from the session rather than a query parameter — a lister may
   * only ever see their own inventory. `blockedBy` is computed here, on the
   * server, for the same reason the admin queue computes it there: the
   * client must not hold its own opinion about what publishing requires.
   */
  @Roles('lister', 'admin')
  @Get('listings/mine')
  async myListings(@Caller() caller: AuthenticatedCaller) {
    return this.listings.findForLister(caller.partyId);
  }

  /**
   * Terms for a property the caller OWNS (F-016).
   *
   * The ownership check is not decoration: without it any registered lister
   * could publish terms against a stranger's property, and a landlord would
   * discover it only when a tenant arrived. Admin is exempt because ops
   * legitimately author on a landlord's behalf, and every such act is
   * already attributable through the audit trail.
   */
  @Roles('lister', 'admin')
  @Post('listings')
  async createListing(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CreateListingDto,
  ) {
    if (caller.role === 'lister') {
      await this.listings.assertOwnsProperty(dto.propertyId, caller.partyId);
    }
    return this.listings.createListing({
      propertyId: dto.propertyId,
      monthlyRent: BigInt(dto.monthlyRent),
      requiredMonthsUpfront: dto.requiredMonthsUpfront,
      depositAmount: BigInt(dto.depositAmount),
      descriptionText: dto.descriptionText,
    });
  }

  /**
   * Lister-callable, but it cannot bypass its own gates: the service
   * independently checks field verification, service-area membership and
   * the per-property mandate, so an unverified or unmandated listing gets
   * 422 (API Spec §4.2).
   */
  @Roles('lister', 'admin')
  @Post('listings/:id/publish')
  async publish(
    @Param('id') id: string,
    @Caller() caller: AuthenticatedCaller,
  ) {
    if (caller.role === 'lister') {
      await this.listings.assertOwnsListing(id, caller.partyId);
    }
    return this.listings.publish(id);
  }

  /**
   * Withdrawing was the sharpest edge of F-016: a lister who knew a
   * competitor's listing id could take their live inventory off the market.
   */
  @Roles('lister', 'admin')
  @Post('listings/:id/withdraw')
  async withdraw(
    @Param('id') id: string,
    @Caller() caller: AuthenticatedCaller,
  ) {
    if (caller.role === 'lister') {
      await this.listings.assertOwnsListing(id, caller.partyId);
    }
    return this.listings.withdraw(id);
  }

  /**
   * FOO-only. A lister verifying their own property would dissolve the
   * entire trust proposition (API Spec §4.2).
   */
  @Roles('foo', 'admin')
  @Post('listings/:id/verify')
  async verify(
    @Param('id') id: string,
    @Caller() caller: AuthenticatedCaller,
  ) {
    // The verifying officer comes from the session, never the body — an
    // audit row naming an actor the client chose would prove nothing
    // (NFR-2).
    return this.listings.markVerified(id, caller.partyId);
  }

  /** FOO-only: availability is confirmed on the ground, not asserted remotely. */
  @Roles('foo', 'admin')
  @Post('listings/:id/confirm-availability')
  async confirmAvailability(
    @Param('id') id: string,
    @Body() dto: ConfirmAvailabilityDto,
  ) {
    return this.listings.confirmAvailability({
      listingId: id,
      status: dto.status,
    });
  }
}
