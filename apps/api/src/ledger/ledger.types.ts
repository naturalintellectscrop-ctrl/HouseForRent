import { LedgerAccountType, LedgerDirection } from '@prisma/client';

/**
 * One leg of a posting. Amount is always POSITIVE integer shillings
 * (bigint); `direction` carries the sign (Data_Model.md §8.2).
 */
export interface PostingLeg {
  accountId: string;
  direction: LedgerDirection;
  amount: bigint;
}

/**
 * A balanced set of legs written atomically under one postingId.
 * `reference` names the operation ('fund_escrow', 'recognise_commission',
 * 'settle', 'refund', or a reversal) for audit/reporting.
 */
export interface PostingInput {
  legs: PostingLeg[];
  reference: string;
  dealId?: string;
  occurredAt?: Date;
}

export class UnbalancedPostingError extends Error {
  constructor(debits: bigint, credits: bigint) {
    super(
      `unbalanced posting rejected: debits=${debits} credits=${credits} (difference=${debits - credits})`,
    );
    this.name = 'UnbalancedPostingError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: bigint) {
    super(`invalid ledger amount ${amount}: every leg amount must be > 0`);
    this.name = 'InvalidAmountError';
  }
}

export class EmptyPostingError extends Error {
  constructor() {
    super('posting rejected: a posting must have at least two legs');
    this.name = 'EmptyPostingError';
  }
}

export { LedgerAccountType, LedgerDirection };
