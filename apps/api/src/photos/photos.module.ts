import { Module } from '@nestjs/common';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';
import { PhotoStore } from './photo-store';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ListingsModule } from '../listings/listings.module';

@Module({
  imports: [PrismaModule, AuditModule, ListingsModule],
  controllers: [PhotosController],
  providers: [PhotosService, PhotoStore],
  exports: [PhotosService, PhotoStore],
})
export class PhotosModule {}
