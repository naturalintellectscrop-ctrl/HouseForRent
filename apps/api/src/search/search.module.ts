import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PhotosModule } from '../photos/photos.module';

/** Read-optimised tenant discovery over the listings data. */
@Module({
  imports: [PhotosModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
