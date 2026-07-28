import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

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
}
