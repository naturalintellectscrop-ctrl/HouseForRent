import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class NeighbourhoodQueryDto {
  /**
   * Admin surfaces only in practice. Harmless to expose — corridor
   * membership is not a secret, and every row returned is still subject to
   * the publish gate (FR-2.5) which this flag cannot influence.
   */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeOutOfArea?: boolean;

  @IsOptional() @IsString() q?: string;
}

/**
 * Note the absence of an id. A client naming its own primary key could
 * collide with, or overwrite the meaning of, a taxonomy node other rows
 * already point at.
 */
export class CreateNeighbourhoodDto {
  @IsString() @MinLength(2) name!: string;

  @IsOptional() @IsString() parentId?: string;

  /** Explicit, never defaulted: opening a corridor is a decision (FR-2.5). */
  @IsBoolean() inServiceArea!: boolean;
}

export class SetServiceAreaDto {
  @IsBoolean() inServiceArea!: boolean;
}
