import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  IdentityProvider,
  NinVerificationResult,
  PhoneVerificationResult,
  SelfieMatchResult,
} from './interfaces/identity-provider.interface';

/**
 * Stands in for the real NIN/liveness provider (procurement-gated, SSOT §8).
 * Deterministic for tests: any input not ending in "-fail" verifies.
 */
@Injectable()
export class MockIdentityProvider implements IdentityProvider {
  async verifyNin(nin: string): Promise<NinVerificationResult> {
    return {
      verified: !nin.endsWith('-fail'),
      providerRef: `mock-nin-${randomUUID()}`,
    };
  }

  async verifyPhone(phone: string): Promise<PhoneVerificationResult> {
    return {
      verified: !phone.endsWith('-fail'),
      providerRef: `mock-phone-${randomUUID()}`,
    };
  }

  async verifySelfieMatch(
    selfieRef: string,
    _idPhotoRef: string,
  ): Promise<SelfieMatchResult> {
    return {
      verified: !selfieRef.endsWith('-fail'),
      providerRef: `mock-selfie-${randomUUID()}`,
    };
  }
}
