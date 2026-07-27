import { Module } from '@nestjs/common';
import { SearchService } from './search.service';

/** Read-optimised tenant discovery over the listings data. */
@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
