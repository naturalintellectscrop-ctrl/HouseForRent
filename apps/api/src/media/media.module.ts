import { Module } from '@nestjs/common';
import { MediaService } from './media.service';
import { MockMediaStorageProvider } from './mock-media-storage.provider';
import { MEDIA_STORAGE_PROVIDER } from './interfaces/media-storage-provider.interface';

/**
 * Company-level media capture (FR-5.5, NFR-5). The storage backend is bound
 * by DI token, so swapping MockMediaStorageProvider for a real object store
 * is a one-line change here and nothing else moves.
 *
 * No controller of its own: media is captured in the context of a field
 * visit, so the endpoint lives on ViewingsController where the assigned-FOO
 * check already applies.
 */
@Module({
  providers: [
    MediaService,
    MockMediaStorageProvider,
    { provide: MEDIA_STORAGE_PROVIDER, useExisting: MockMediaStorageProvider },
  ],
  exports: [MediaService, MEDIA_STORAGE_PROVIDER, MockMediaStorageProvider],
})
export class MediaModule {}
