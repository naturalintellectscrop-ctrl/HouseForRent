import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PhotosService, PhotoTooLargeError } from './photos.service';
import { PhotoStore } from './photo-store';
import { ListingsService } from '../listings/listings.service';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { Caller } from '../auth/caller.decorator';
import type { AuthenticatedCaller } from '../auth/auth.service';
import { UploadPhotoDto } from './dto/photo.dto';

@Controller('v1')
export class PhotosController {
  constructor(
    private readonly photos: PhotosService,
    private readonly listings: ListingsService,
  ) {}

  /**
   * Serves a photograph's bytes.
   *
   * Public, because a listing's photographs are as public as the listing —
   * and a shared link must open for someone who has not signed up
   * (Decision 3). It serves through the API rather than handing out an
   * object-store URL so that moving storage, or gating a photo later, does
   * not break every link already in circulation.
   */
  @Public()
  @Get('media/:mediaAssetId')
  async media(
    @Param('mediaAssetId') mediaAssetId: string,
    @Res() res: Response,
  ) {
    const found = await this.photos.bytesFor(mediaAssetId);
    if (!found) {
      // 404 rather than a placeholder image: a surface that receives bytes
      // it did not expect cannot tell a missing photo from a real one, and
      // an honest empty frame is the design (FR-4.2).
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'no bytes for that media asset' },
      });
      return;
    }

    res.setHeader('Content-Type', found.mimeType);
    res.setHeader('Content-Length', found.bytes.byteLength);
    // Content is addressed by hash of the bytes, so a given media asset id
    // never changes what it serves — it is safe to cache hard.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(found.bytes);
  }

  /** A listing's photographs. Public for the same reason the bytes are. */
  @Public()
  @Get('listings/:listingId/photos')
  async list(@Param('listingId') listingId: string) {
    return { photos: await this.photos.forListing(listingId) };
  }

  /**
   * Uploads a photograph to a listing.
   *
   * Ownership is checked in the service, not assumed from the role: holding
   * `lister` is not the same as being THIS listing's landlord. A field
   * officer or admin may also upload — theirs is recorded as
   * `field_officer` provenance, which is the only kind a surface may
   * describe as verified.
   */
  @Roles('lister', 'foo', 'admin')
  @Post('listings/:listingId/photos')
  async upload(
    @Param('listingId') listingId: string,
    @Caller() caller: AuthenticatedCaller,
    @Body() dto: UploadPhotoDto,
  ) {
    if (caller.role === 'lister') {
      await this.listings.assertOwnsListing(listingId, caller.partyId);
    } else {
      await this.listings.getListingOrThrow(listingId);
    }

    const bytes = Buffer.from(dto.dataBase64, 'base64');
    // Checked here as well as in the service: a base64 string can expand,
    // and the earliest possible refusal is the cheapest one.
    if (bytes.byteLength > PhotoStore.MAX_BYTES) {
      throw new PhotoTooLargeError(bytes.byteLength);
    }

    return this.photos.attach({
      listingId,
      uploadedByPartyId: caller.partyId,
      role: caller.role as 'lister' | 'foo' | 'admin',
      mimeType: dto.mimeType,
      bytes,
      caption: dto.caption,
    });
  }

  @Roles('lister', 'foo', 'admin')
  @Post('listings/:listingId/photos/:photoId/remove')
  async remove(
    @Param('listingId') listingId: string,
    @Param('photoId') photoId: string,
    @Caller() caller: AuthenticatedCaller,
  ) {
    if (caller.role === 'lister') {
      await this.listings.assertOwnsListing(listingId, caller.partyId);
    }
    await this.photos.remove({ photoId, actorPartyId: caller.partyId });
    return { removed: photoId };
  }
}
