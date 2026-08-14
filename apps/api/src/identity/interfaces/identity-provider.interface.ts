/**
 * External NIN/liveness matcher, abstracted behind this interface
 * (Technical Architecture §4.1, §9). V1 ships MockIdentityProvider; a real
 * provider is a later implementation of the same interface — no consumer
 * knows which is behind it. No raw NIN is ever returned by this interface;
 * callers persist only the resulting state and an opaque providerRef.
 */
export interface NinVerificationResult {
  verified: boolean;
  providerRef: string;
}

export interface SelfieMatchResult {
  verified: boolean;
  providerRef: string;
}

export interface PhoneVerificationResult {
  verified: boolean;
  providerRef: string;
}

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');

export interface IdentityProvider {
  /** Verifies a NIN against the national registry. Never returns/persists the raw NIN. */
  verifyNin(nin: string): Promise<NinVerificationResult>;
  /** Verifies a phone number via OTP or equivalent. */
  verifyPhone(phone: string): Promise<PhoneVerificationResult>;
  /** Matches a selfie capture against the ID photo (liveness + match). */
  verifySelfieMatch(selfieRef: string, idPhotoRef: string): Promise<SelfieMatchResult>;
}
