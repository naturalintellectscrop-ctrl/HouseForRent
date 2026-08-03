import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { Public } from '../auth/public.decorator';
import { SearchQueryDto } from './dto/search.dto';
import { ListingNotFoundError } from '../listings/listings.service';

/**
 * Tenant discovery (FR-4.1 – FR-4.4).
 *
 * Public by design: tenants pay nothing and browsing requires no account
 * (Decision 3). The three non-negotiable constraints — live, verified,
 * in-service-area — are applied in the service regardless of query, so an
 * anonymous caller cannot widen past the public feed.
 */
@Controller('v1/listings')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  async search(@Query() query: SearchQueryDto) {
    return this.searchService.search({
      neighbourhoodIds: query.neighbourhoodId
        ? [query.neighbourhoodId]
        : undefined,
      minRent: query.minRent ? BigInt(query.minRent) : undefined,
      maxRent: query.maxRent ? BigInt(query.maxRent) : undefined,
      bedrooms: query.bedrooms,
      amenityIds: query.amenityId ? [query.amenityId] : undefined,
      includeStale: query.includeStale,
    });
  }

  /** Detail view, including what the officer confirmed on site (FR-4.3). */
  @Public()
  @Get(':id/field-confirmed')
  async fieldConfirmed(@Param('id') id: string) {
    return { fieldConfirmed: await this.searchService.fieldConfirmedSummary(id) };
  }

  /**
   * One listing (API Spec §9.1). Public, because browsing requires no
   * account (Decision 3) and a shared link must open for anyone.
   *
   * A listing outside the public feed — unverified, withdrawn, or out of
   * corridor — returns 404 rather than 403. A 403 would confirm it exists,
   * which is how an unpublished address becomes discoverable by probing.
   */
  @Public()
  @Get(':id')
  async detail(@Param('id') id: string) {
    const listing = await this.searchService.publicDetail(id);
    if (!listing) {
      throw new ListingNotFoundError(id);
    }
    return listing;
  }
}
