import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { ListingsController } from './listings.controller';
import { IdentityModule } from '../identity/identity.module';

/**
 * Listings & Properties. Calls Identity for mandate enforcement at publish
 * and Config for the service area and freshness window — it does not
 * reimplement either rule locally.
 */
@Module({
  imports: [IdentityModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
