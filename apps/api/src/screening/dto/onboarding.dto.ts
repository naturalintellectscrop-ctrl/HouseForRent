import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

/**
 * ── What this DTO does NOT accept ──
 * No `partyId`: the tenant being verified is the CALLER, read from the
 * session. A body that could name a party would let anyone mark anyone else
 * verified, which is the one claim a landlord relies on when they accept
 * our terms.
 *
 * No `state`, no `verifiedAt`, no `providerRef`: those are outcomes of the
 * identity provider, not inputs. With `forbidNonWhitelisted` globally on,
 * sending any of them is a 400 rather than a silently ignored field.
 */
export class RecordConsentDto {
  /**
   * Which version of the privacy policy the tenant was shown.
   *
   * Required, and deliberately not defaulted. A consent record that cannot
   * say WHAT was consented to is not evidence of consent (NFR-3, DPA 2019
   * s.7) — and a default would quietly attribute agreement to whatever text
   * happened to be current at write time rather than at reading time.
   */
  @IsString()
  @MinLength(1)
  policyVersion!: string;
}

/**
 * The three identity factors (FR-1.4).
 *
 * These values cross the IdentityProvider boundary and are NEVER persisted:
 * only a verification state and an opaque provider reference remain. That is
 * why they may be accepted here at all.
 */
export class SubmitIdentityDto {
  /** Uganda NIN — 14 alphanumeric characters. */
  @Matches(/^[A-Za-z0-9]{14}$/, {
    message: 'nin must be the 14-character National Identification Number',
  })
  nin!: string;

  @IsString()
  @MinLength(9)
  phone!: string;

  /**
   * Opaque handles to captured images, never the bytes. V1 runs a mock
   * provider, so these are references it recognises rather than files.
   */
  @IsString() selfieRef!: string;
  @IsString() idPhotoRef!: string;
}

export class ScreenTenantDto {
  @IsOptional() @IsString() dealId?: string;
}
