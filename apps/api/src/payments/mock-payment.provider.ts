import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CollectInstruction,
  PaymentProvider,
  PayoutInstruction,
  ProviderResult,
  RefundInstruction,
} from './interfaces/payment-provider.interface';

/**
 * Stands in for the licensed PSP until procurement completes (SSOT §8).
 *
 * It is a genuine test double, not a stub that always says yes:
 *   - it enforces idempotency by key, returning the ORIGINAL result on a
 *     repeat and flagging it as deduplicated;
 *   - it fails deterministically for references containing '-fail', so
 *     failure paths are exercisable;
 *   - it tracks a custodian balance that moves with collections, payouts
 *     and refunds, so reconciliation can be tested against something real
 *     rather than a constant.
 *
 * Being in-memory, its state resets per process — appropriate for a mock,
 * and a reason no business logic may depend on it beyond tests.
 */
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  private readonly byIdempotencyKey = new Map<string, ProviderResult>();
  private readonly byProviderRef = new Map<string, ProviderResult>();
  private balance = 0n;

  async collectToEscrow(
    instruction: CollectInstruction,
  ): Promise<ProviderResult> {
    return this.execute(
      instruction.idempotencyKey,
      instruction.reference,
      () => {
        this.balance += instruction.amount;
      },
    );
  }

  async releaseTo(instruction: PayoutInstruction): Promise<ProviderResult> {
    return this.execute(
      instruction.idempotencyKey,
      instruction.reference,
      () => {
        this.balance -= instruction.amount;
      },
    );
  }

  async refund(instruction: RefundInstruction): Promise<ProviderResult> {
    return this.execute(
      instruction.idempotencyKey,
      instruction.reference,
      () => {
        this.balance -= instruction.amount;
      },
    );
  }

  async status(providerRef: string): Promise<ProviderResult> {
    const known = this.byProviderRef.get(providerRef);
    if (known) {
      return known;
    }
    return {
      outcome: 'failed',
      providerRef,
      failureReason: 'unknown providerRef',
    };
  }

  async custodianBalance(): Promise<bigint> {
    return this.balance;
  }

  /** Test affordance: lets a test simulate the custodian diverging from our ledger. */
  setCustodianBalanceForTesting(value: bigint): void {
    this.balance = value;
  }

  private execute(
    idempotencyKey: string,
    reference: string,
    applyEffect: () => void,
  ): ProviderResult {
    const existing = this.byIdempotencyKey.get(idempotencyKey);
    if (existing) {
      // The effect is NOT applied again — this is the whole point of the key.
      return { ...existing, deduplicated: true };
    }

    const providerRef = `mock-psp-${randomUUID()}`;

    if (reference.includes('-fail')) {
      const failed: ProviderResult = {
        outcome: 'failed',
        providerRef,
        failureReason: 'simulated provider failure',
      };
      this.byIdempotencyKey.set(idempotencyKey, failed);
      this.byProviderRef.set(providerRef, failed);
      return failed;
    }

    applyEffect();
    const succeeded: ProviderResult = { outcome: 'succeeded', providerRef };
    this.byIdempotencyKey.set(idempotencyKey, succeeded);
    this.byProviderRef.set(providerRef, succeeded);
    return succeeded;
  }
}
