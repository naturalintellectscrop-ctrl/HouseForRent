import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const SHILLINGS = /^[0-9]+$/;

/**
 * Note the absence of `verificationState` and `publicationState`: a lister
 * cannot assert that their own property is verified or live (API Spec §7.2).
 * Those are outcomes of server-side processes, reached through their own
 * guarded endpoints.
 */
export class CreatePropertyDto {
  @IsIn(['apartment', 'house', 'room', 'other'])
  propertyType!: 'apartment' | 'house' | 'room' | 'other';

  @IsInt() @Min(0) bedrooms!: number;
  @IsInt() @Min(0) bathrooms!: number;

  @IsIn(['furnished', 'semi_furnished', 'unfurnished'])
  furnished!: 'furnished' | 'semi_furnished' | 'unfurnished';

  @IsString() neighbourhoodId!: string;

  /** Required — location is taxonomy + landmark first (FR-2.2). */
  @IsString() landmarkText!: string;

  /** Optional, and never required (FR-2.2). */
  @IsOptional() @IsString() streetAddress?: string;
}

export class CreateListingDto {
  @IsString() propertyId!: string;

  @Matches(SHILLINGS, {
    message: 'monthlyRent must be a string of integer shillings',
  })
  monthlyRent!: string;

  @IsInt() @Min(1) requiredMonthsUpfront!: number;

  @Matches(SHILLINGS, {
    message: 'depositAmount must be a string of integer shillings',
  })
  depositAmount!: string;

  @IsOptional() @IsString() descriptionText?: string;
}

export class ConfirmAvailabilityDto {
  @IsIn(['available', 'unavailable'])
  status!: 'available' | 'unavailable';
}
