import { IsIn, IsString, MinLength } from 'class-validator';

/**
 * Note what these DTOs do NOT accept: no role for staff endpoints, no
 * partyId, no verification state. The global ValidationPipe runs with
 * `forbidNonWhitelisted`, so a body carrying an unexpected field is
 * rejected outright rather than silently ignored — a client cannot smuggle
 * `status`, `commissionAmount` or `isVerified` into any request.
 */
export class RegisterDto {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(9)
  primaryPhone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  /** Only self-service roles are accepted here (API Spec §3). */
  @IsIn(['tenant', 'lister'])
  role!: 'tenant' | 'lister';
}

export class LoginDto {
  @IsString()
  primaryPhone!: string;

  @IsString()
  password!: string;
}

export class RefreshDto {
  @IsString()
  refreshToken!: string;
}

export class ProvisionStaffDto {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(9)
  primaryPhone!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['foo', 'admin'])
  role!: 'foo' | 'admin';
}
