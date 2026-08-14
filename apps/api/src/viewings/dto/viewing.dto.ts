import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * Note the absences throughout this file. No DTO accepts `status`,
 * `conductedByRole`, `landlordPartyId` or `introducedAt`:
 *
 *   - `status` is reached only through the named transition endpoints;
 *   - `conductedByRole` is 'foo' in V1 and a client cannot elect otherwise
 *     (FR-5.6 — the seam is the enum, not a request field);
 *   - `landlordPartyId` and `introducedAt` are derived server-side, because
 *     introduction records are evidence and evidence no party chose the
 *     contents of is the only kind worth having (FR-5.3).
 *
 * With `forbidNonWhitelisted` globally on, sending any of them is a 400
 * rather than a silently ignored field.
 */

export class RequestViewingDto {
  @IsString() listingId!: string;

  /** The time the tenant is asking for; dispatch may move it at assignment. */
  @IsISO8601() scheduledFor!: string;
}

export class AssignViewingDto {
  @IsString() fooPartyId!: string;

  @IsOptional() @IsISO8601() scheduledFor?: string;
}

export class FieldReportDto {
  @IsIn(['excellent', 'good', 'fair', 'poor'])
  conditionRating!: 'excellent' | 'good' | 'fair' | 'poor';

  /** Accuracy-vs-listing. Structured, so it is measurable (Decision 9). */
  @IsBoolean() matchesListing!: boolean;

  /** Writes back to listing availability and the freshness clock (FR-2.3). */
  @IsBoolean() isAvailable!: boolean;

  @IsOptional() @IsString() issuesText?: string;
  @IsOptional() @IsString() timingNote?: string;

  @IsOptional() @IsString({ each: true }) mediaAssetIds?: string[];
}

export class ConductViewingDto {
  @IsOptional() @IsString() note?: string;
}

export class NoShowDto {
  @IsOptional() @IsString() note?: string;
}

export class CaptureMediaDto {
  @IsIn(['image', 'video']) kind!: 'image' | 'video';

  @IsString() mimeType!: string;

  /** Bytes the device is offering, checked against policy before storage. */
  @IsInt() @Min(1) sourceByteSize!: number;

  /** Opaque handle to the source, never the bytes themselves. */
  @IsString() sourceRef!: string;
}
