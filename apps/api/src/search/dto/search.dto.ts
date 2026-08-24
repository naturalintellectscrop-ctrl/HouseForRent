import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

const SHILLINGS = /^[0-9]+$/;

/**
 * Query params arrive as strings. Money stays a string all the way to
 * BigInt (API Spec §2); bedrooms is coerced to an integer explicitly rather
 * than relying on implicit conversion.
 */
export class SearchQueryDto {
  @IsOptional() @IsString() neighbourhoodId?: string;

  @IsOptional()
  @Matches(SHILLINGS, { message: 'minRent must be integer shillings' })
  minRent?: string;

  @IsOptional()
  @Matches(SHILLINGS, { message: 'maxRent must be integer shillings' })
  maxRent?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  bedrooms?: number;

  @IsOptional() @IsString() amenityId?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeStale?: boolean;

  @IsOptional()
  @IsIn(['furnished', 'semi_furnished', 'unfurnished'])
  furnished?: 'furnished' | 'semi_furnished' | 'unfurnished';

  @IsOptional()
  @IsIn(['apartment', 'house', 'room', 'other'])
  propertyType?: 'apartment' | 'house' | 'room' | 'other';

  /** Matched against neighbourhood and landmark only — see SearchFilters. */
  @IsOptional() @IsString() q?: string;

  @IsOptional()
  @IsIn(['fresh', 'rent_asc', 'rent_desc', 'newest'])
  sort?: 'fresh' | 'rent_asc' | 'rent_desc' | 'newest';

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(0)
  offset?: number;
}
