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

/**
 * A body that must be empty.
 *
 * `logout-all` and `sessions` derive their subject from the SESSION and
 * read nothing from the body. Without a DTO, Nest ignores the body
 * entirely — so a client sending `{ userAccountId: <someone else> }` would
 * get a cheerful 200 and reasonably believe it had signed that person out.
 *
 * The endpoint is safe either way (it never reads the field), but silently
 * accepting a request whose evident intent was not honoured is precisely
 * what `forbidNonWhitelisted` exists to prevent everywhere else in this
 * API. Declaring an empty DTO makes the refusal explicit and consistent.
 */
export class EmptyBodyDto {}

export class RequestPasswordResetDto {
  @IsString()
  primaryPhone!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  /**
   * The same 8-character floor as registration. Stated here rather than
   * inherited, because a reset that accepted a weaker password than signup
   * would make the signup rule pointless — an attacker would simply reset.
   */
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
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
