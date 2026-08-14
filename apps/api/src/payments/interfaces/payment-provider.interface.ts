/**
 * The boundary to the external, Bank of Uganda-licensed payment service
 * provider (SSOT Decision 7, FR-7.1, Technical Architecture §5.2).
 *
 * ── House For Rent is NOT the custodian ──
 * Every method here issues an INSTRUCTION to a third party that actually
 * holds the money. Nothing in this interface (or anything implementing it)
 * may be read as our own account holding funds. Our ledger mirrors custody
 * state; the provider is the custodian. Where the two disagree, that is a
 * reconciliation alert (FR-7.8) — we do not silently trust either side.
 *
 * ── Product-agnostic ──
 * Deliberately expressed in payer/payee/amount/reference terms. There is no
 * "rent", "commission", "landlord" or "listing" in this interface, because
 * Payments is a Natural Intellects company-level service and House For Rent
 * is merely its first consumer (SSOT §5 rule 8). Smart Ride must be able to
 * implement against this unchanged.
 *
 * ── Mobile-money-first, but not mobile-money-coupled ──
 * `PaymentMethod` names the rails conceptually (MTN MoMo, Airtel Money) so
 * a caller can express intent, without any provider's API shape leaking
 * into the domain. V1 ships MockPaymentProvider; the real PSP is a later
 * implementation of this same interface and no consumer changes.
 */

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type PaymentMethod = 'mtn_momo' | 'airtel_money' | 'bank_transfer';

export interface PaymentAccountRef {
  /** Opaque handle for the party's account at the provider (e.g. a masked MSISDN). */
  accountRef: string;
  method: PaymentMethod;
}

export interface PaymentInstruction {
  /**
   * Caller-generated key that makes this instruction safe to retry. The
   * provider MUST treat two calls with the same key as one instruction
   * (FR-7.8).
   */
  idempotencyKey: string;
  amount: bigint;
  currency: string;
  /** Opaque correlation reference for reconciliation; not interpreted here. */
  reference: string;
}

export interface CollectInstruction extends PaymentInstruction {
  from: PaymentAccountRef;
}

export interface PayoutInstruction extends PaymentInstruction {
  to: PaymentAccountRef;
}

export interface RefundInstruction extends PaymentInstruction {
  /** The provider reference of the original collection being refunded. */
  originalProviderRef: string;
  to: PaymentAccountRef;
}

export type ProviderOutcome = 'succeeded' | 'failed' | 'pending';

export interface ProviderResult {
  outcome: ProviderOutcome;
  /** The provider's own identifier for this instruction. */
  providerRef: string;
  /** Present when outcome is 'failed'. */
  failureReason?: string;
  /**
   * True when the provider recognised the idempotency key and returned the
   * ORIGINAL result rather than performing the action again. Consumers use
   * this to distinguish "we just did it" from "it was already done".
   */
  deduplicated?: boolean;
}

export interface PaymentProvider {
  /** Instructs the custodian to collect funds into escrow custody. */
  collectToEscrow(instruction: CollectInstruction): Promise<ProviderResult>;

  /** Instructs the custodian to release held funds to a payee. */
  releaseTo(instruction: PayoutInstruction): Promise<ProviderResult>;

  /** Instructs the custodian to return collected funds to the original payer. */
  refund(instruction: RefundInstruction): Promise<ProviderResult>;

  /** Queries the current status of a previously issued instruction. */
  status(providerRef: string): Promise<ProviderResult>;

  /**
   * The balance the CUSTODIAN reports holding for us. Used only for
   * reconciliation against our ledger — never as an input to business
   * logic, because the ledger is authoritative (Technical Architecture
   * §5.2).
   */
  custodianBalance(): Promise<bigint>;
}
