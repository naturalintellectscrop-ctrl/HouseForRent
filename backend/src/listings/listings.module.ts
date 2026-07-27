import { Module } from '@nestjs/common';
import { ListingsService } from './listings.service';
import { IdentityModule } from '../identity/identity.module';

/**
 * Listings & Properties. Calls Identity for mandate enforcement at publish
 * and Config for the service area and freshness window — it does not
 * reimplement either rule locally.
 */
@Module({
  imports: [IdentityModule],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
