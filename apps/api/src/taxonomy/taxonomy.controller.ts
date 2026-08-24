import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { TaxonomyService } from './taxonomy.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import type { AuthenticatedCaller } from '../auth/auth.service';
import {
  CreateNeighbourhoodDto,
  NeighbourhoodQueryDto,
  SetServiceAreaDto,
} from './dto/taxonomy.dto';

/**
 * The location and amenity vocabulary (closes F-015).
 *
 * Public to read, admin to write. Reading is public for the same reason
 * `GET /v1/listings` is: browsing requires no account (Decision 3), and a
 * search filter whose values cannot be discovered is not a filter.
 */
@Controller('v1')
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Public()
  @Get('neighbourhoods')
  async neighbourhoods(@Query() query: NeighbourhoodQueryDto) {
    return {
      neighbourhoods: await this.taxonomy.neighbourhoods({
        includeOutOfArea: query.includeOutOfArea,
        q: query.q,
      }),
    };
  }

  @Public()
  @Get('amenities')
  async amenities() {
    return { amenities: await this.taxonomy.amenities() };
  }

  /**
   * Admin-only. `inServiceArea` decides what the public feed can contain
   * (FR-2.5); a lister able to mint an in-service neighbourhood would have
   * routed around corridor scoping.
   */
  @Roles('admin')
  @Post('neighbourhoods')
  async create(
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: CreateNeighbourhoodDto,
  ) {
    return this.taxonomy.create({
      name: dto.name,
      parentId: dto.parentId,
      inServiceArea: dto.inServiceArea,
      // The actor comes from the session — an audit row naming an actor the
      // client chose would prove nothing (NFR-2).
      actorPartyId: caller.partyId,
    });
  }

  @Roles('admin')
  @Post('neighbourhoods/:id/service-area')
  async setServiceArea(
    @Param('id') id: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: SetServiceAreaDto,
  ) {
    return this.taxonomy.setServiceArea({
      id,
      inServiceArea: dto.inServiceArea,
      actorPartyId: caller.partyId,
    });
  }
}
