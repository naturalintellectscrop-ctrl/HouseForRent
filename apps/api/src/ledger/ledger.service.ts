import { Injectable } from '@nestjs/common';
import { Prisma, LedgerAccountType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmptyPostingError,
  InvalidAmountError,
  PostingInput,
  UnbalancedPostingError,
} from './ledger.types';

/** Prisma transaction client — the subset available inside $transaction. */
type Tx = Prisma.TransactionClient;

/**
 * The double-entry ledger — the authoritative record of all value movement
 * (Data_Model.md §8, FR-7.2).
 *
 * Every mutation goes through `post()`, which is the ONLY place ledger
 * entries are written. It validates before committing:
 *   - at least two legs;
 *   - every leg amount > 0 (direction carries the sign);
 *   - sum(debits) === sum(credits) for the posting.
 * A posting that fails any of these throws before any row is written, so an
 * unbalanced posting can never reach the database.
 *
 * Posted entries are immutable — nothing in this service issues an UPDATE or
 * DELETE against ledger_entry, and the database enforces that independently
 * via trigger (migration 20260727150100_immutable_tables). Corrections are
 * new reversing postings (`reverse()`).
 *
 * All money is bigint integer shillings. No float arithmetic appears
 * anywhere in this file.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a typed ledger account. */
  async createAccount(params: {
    accountType: LedgerAccountType;
    ownerPartyId?: string;
    dealId?: string;
    currency?: string;
  }) {
    return this.prisma.ledgerAccount.create({
      data: {
        accountType: params.accountType,
        ownerPartyId: params.ownerPartyId,
        dealId: params.dealId,
        currency: params.currency ?? 'UGX',
      },
    });
  }

  /**
   * Writes one balanced posting atomically. Returns the postingId.
   *
   * If `tx` is supplied the posting joins that caller's transaction (so a
   * deal-state change and its ledger effect commit or roll back together —
   * Technical Architecture §8). Otherwise it opens its own.
   */
  async post(input: PostingInput, tx?: Tx): Promise<string> {
    this.validate(input);

    const postingId = randomUUID();
    const occurredAt = input.occurredAt ?? new Date();

    const write = async (client: Tx) => {
      await client.ledgerEntry.createMany({
        data: input.legs.map((leg) => ({
          postingId,
          accountId: leg.accountId,
          direction: leg.direction,
          amount: leg.amount,
          dealId: input.dealId,
          reference: input.reference,
          occurredAt,
        })),
      });
    };

    if (tx) {
      await write(tx);
    } else {
      await this.prisma.$transaction(write);
    }

    return postingId;
  }

  /**
   * Rejects the posting before anything is written if it is empty,
   * has a non-positive leg, or does not balance.
   *
   * Public so the invariant can be property-tested directly, without a DB
   * round-trip per case. `post()` always calls it first, so testing this is
   * testing the real guard, not a copy of it.
   */
  validate(input: PostingInput): void {
    if (input.legs.length < 2) {
      throw new EmptyPostingError();
    }

    let debits = 0n;
    let credits = 0n;

    for (const leg of input.legs) {
      if (leg.amount <= 0n) {
        throw new InvalidAmountError(leg.amount);
      }
      if (leg.direction === 'debit') {
        debits += leg.amount;
      } else {
        credits += leg.amount;
      }
    }

    if (debits !== credits) {
      throw new UnbalancedPostingError(debits, credits);
    }
  }

  /**
   * Corrections are new reversing postings, never edits (FR-7.2). Mirrors
   * every leg of the original posting with the opposite direction.
   */
  async reverse(postingId: string, reason: string, tx?: Tx): Promise<string> {
    // Read on the caller's transaction client when there is one — reading
    // from a separate connection would both risk deadlock and read a
    // pre-transaction snapshot, potentially reversing stale legs.
    const client = tx ?? this.prisma;
    const original = await client.ledgerEntry.findMany({
      where: { postingId },
    });
    if (original.length === 0) {
      throw new Error(`cannot reverse unknown posting ${postingId}`);
    }

    return this.post(
      {
        legs: original.map((entry) => ({
          accountId: entry.accountId,
          direction: entry.direction === 'debit' ? 'credit' : 'debit',
          amount: entry.amount,
        })),
        reference: `reversal:${reason}`,
        dealId: original[0].dealId ?? undefined,
      },
      tx,
    );
  }

  /**
   * Net balance of an account, as debits − credits in integer shillings.
   *
   * Sign convention: this returns the raw debit-minus-credit figure. For
   * asset-side accounts (psp_clearing) a positive result means value held;
   * for liability/revenue accounts (escrow_liability, commission_revenue,
   * landlord_payable) the natural balance is a CREDIT, so a negative result
   * is the normal, healthy state. Callers that want the natural-side
   * magnitude should use `balanceOf` on the account type they expect and
   * interpret accordingly — this method deliberately does not hide the sign,
   * because silently flipping it is how ledgers get misread.
   */
  async balanceOf(accountId: string): Promise<bigint> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { accountId },
      select: { direction: true, amount: true },
    });

    return entries.reduce(
      (acc, entry) =>
        entry.direction === 'debit' ? acc + entry.amount : acc - entry.amount,
      0n,
    );
  }

  /**
   * What this deal STILL OWES BACK — the credit-side magnitude of
   * `escrow_liability`, as a positive number.
   *
   * ── Why this is the authoritative settlement figure ──
   * `recogniseCommission` has already DEBITED the earned commission out of
   * this account by the time settlement runs, so whatever remains is
   * precisely what is still owed onward to the landlord. Settlement
   * therefore does not need to subtract a commission from a total someone
   * typed in: FR-7.6's "net of earned commission" is satisfied by
   * construction, because the commission has already left this balance.
   *
   * ── Why it takes a transaction client ──
   * The balance MUST be read inside the same transaction that posts against
   * it. Read outside, two operators settling the same deal concurrently
   * would each see the full liability and each release it, paying a landlord
   * twice from one escrow. Inside, the second sees the first's effect — or
   * blocks until it can.
   *
   * Returned positive so callers cannot accidentally post a negated figure;
   * `balanceOf` deliberately preserves the raw sign for reading, and this
   * deliberately does not, because it exists to be POSTED.
   */
  async outstandingEscrowLiability(dealId: string, tx?: Tx): Promise<bigint> {
    const client = tx ?? this.prisma;
    const entries = await client.ledgerEntry.findMany({
      where: { dealId, account: { accountType: 'escrow_liability' } },
      select: { direction: true, amount: true },
    });

    return entries.reduce(
      (acc, entry) =>
        entry.direction === 'credit' ? acc + entry.amount : acc - entry.amount,
      0n,
    );
  }

  /** Sum of debits − credits across every entry for a deal, per account type. */
  async balancesByTypeForDeal(
    dealId: string,
  ): Promise<Map<LedgerAccountType, bigint>> {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { dealId },
      select: {
        direction: true,
        amount: true,
        account: { select: { accountType: true } },
      },
    });

    const balances = new Map<LedgerAccountType, bigint>();
    for (const entry of entries) {
      const type = entry.account.accountType;
      const current = balances.get(type) ?? 0n;
      balances.set(
        type,
        entry.direction === 'debit'
          ? current + entry.amount
          : current - entry.amount,
      );
    }
    return balances;
  }

  /**
   * Global integrity check: every posting in the ledger balances. Used by
   * tests and by the Stage 4 reconciliation view. A `false` here means the
   * ledger has been corrupted by something bypassing `post()`.
   */
  async everyPostingBalances(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<
      { posting_id: string; net: bigint }[]
    >`
      SELECT posting_id,
             SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) AS net
      FROM ledger_entry
      GROUP BY posting_id
      HAVING SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END) <> 0
    `;
    return rows.length === 0;
  }
}
