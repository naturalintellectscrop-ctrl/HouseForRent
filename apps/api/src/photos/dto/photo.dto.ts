import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PhotoStore } from '../photo-store';

/**
 * ── Why base64 in a JSON body and not multipart ──
 * Every other endpoint in this API takes JSON and is validated by the same
 * global `ValidationPipe` with `forbidNonWhitelisted`. A multipart route
 * would sit outside that pipe and need its own parser, its own size guard
 * and its own field allowlist — three chances to be inconsistent with the
 * rest of the surface, on the one route that accepts arbitrary bytes.
 *
 * Note what this DTO does NOT accept: no `source`. Provenance is decided
 * from the caller's role server-side. A lister able to send
 * `source: 'field_officer'` could label their own snapshot as evidence that
 * our officer stood in the room, which is the single claim this platform
 * sells (FR-4.2).
 */
export class UploadPhotoDto {
  @IsIn(PhotoStore.ACCEPTED as unknown as string[])
  mimeType!: string;

  /** Base64, no data-URI prefix. Size is checked after decoding. */
  @IsString()
  dataBase64!: string;

  @IsOptional() @IsString() @MaxLength(200) caption?: string;
}
