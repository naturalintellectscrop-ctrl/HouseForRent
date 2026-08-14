import { Injectable } from '@nestjs/common';
import { Prisma, LedgerAccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

type Tx = Prisma.TransactionClient;

/**
 * Escrow orchestration primitives (Technical Architecture §5.3), posting the
 * canonical entry sets from Data_Model.md §8.2.
 *
 * PRODUCT-AGNOSTIC BY CONSTRUCTION: every method takes an explicit `amount`
 * and works in terms of parties/accounts/amounts. Nothing here computes a
 * commission, reads a rent, or knows what a "listing" is — the commission
 * FIGURE is computed by the Deals module (Stage 3) from the deal's
 * snapshots and handed in. That separation is what keeps Payments reusable
 * across Natural Intellects products (SSOT §5 rule 8) and is why
 * `recogniseCommission` takes an amount rather than a rate.
 *
 * SEQUENCING IS NOT ENFORCED HERE. The rule that funds cannot be released
 * before move-in is a property of the deal state machine's transition graph
 * (Stage 3) — there is no escrow_funded → settled edge. These primitives are
 * the mechanism; the guarantee is the shape of the graph that calls them.
 */
@Injectable()
export class EscrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Client money enters custody: debit psp_clearing, credit escrow_liability.
   *
   * The credit lands on a LIABILITY account — House For Rent owes this money
   * back to the tenant (or onward to the landlord). NO revenue account is
   * touched. Recognising escrow inflow as revenue is the critical defect
   * this posting exists to prevent (SSOT Decision 7, FR-7.2).
   */
  async fundEscrow(
    params: { dealId: string; amount: bigint },
    tx?: Tx,
  ): Promise<string> {
    const pspClearing = await this.accountFor(
      'psp_clearing',
      params.dealId,
      tx,
    );
    const escrowLiability = await this.accountFor(
      'escrow_liability',
      params.dealId,
      tx,
    );

    return this.ledger.post(
      {
        legs: [
          {
            accountId: pspClearing.id,
            direction: 'debit',
            amount: params.amount,
          },
          {
            accountId: escrowLiability.id,
            direction: 'credit',
            amount: params.amount,
          },
        ],
        reference: 'fund_escrow',
        dealId: params.dealId,
      },
      tx,
    );
  }

  /**
   * Commission is EARNED (FR-7.5): debit escrow_liability, credit
   * commission_revenue. This is the only posting in the system that creates
   * revenue, and the Deals state machine fires it at move_in_confirmed —
   * never at fund time, never at settlement.
   *
   * `amount` is the already-computed commission from the deal's snapshots
   * (monthly_rent_snapshot × commission_rate_bp_snapshot / 10000). This
   * service does not and must not derive it.
   */
  async recogniseCommission(
    params: { dealId: string; amount: bigint },
    tx?: Tx,
  ): Promise<string> {
    const escrowLiability = await this.accountFor(
      'escrow_liability',
      params.dealId,
      tx,
    );
    const commissionRevenue = await this.accountFor(
      'commission_revenue',
      params.dealId,
      tx,
    );

    return this.ledger.post(
      {
        legs: [
          {
            accountId: escrowLiability.id,
            direction: 'debit',
            amount: params.amount,
          },
          {
            accountId: commissionRevenue.id,
            direction: 'credit',
            amount: params.amount,
          },
        ],
        reference: 'recognise_commission',
        dealId: params.dealId,
      },
      tx,
    );
  }

  /**
   * Settlement, part 1 (Data_Model.md §8.2): debit escrow_liability for what
   * remains after commission, credit landlord_payable. Clears the liability
   * to the tenant and creates the payable to the landlord.
   */
  async settle(
    params: { dealId: string; amount: bigint },
    tx?: Tx,
  ): Promise<string> {
    const escrowLiability = await this.accountFor(
      'escrow_liability',
      params.dealId,
      tx,
    );
    const landlordPayable = await this.accountFor(
      'landlord_payable',
      params.dealId,
      tx,
    );

    return this.ledger.post(
      {
        legs: [
          {
            accountId: escrowLiability.id,
            direction: 'debit',
            amount: params.amount,
          },
          {
            accountId: landlordPayable.id,
            direction: 'credit',
            amount: params.amount,
          },
        ],
        reference: 'settle',
        dealId: params.dealId,
      },
      tx,
    );
  }

  /**
   * Settlement, part 2: the PSP actually releases the money —
   * debit landlord_payable, credit psp_clearing. Split from `settle` because
   * they are distinct events: the payable exists the moment settlement is
   * authorised; the clearing movement happens when the custodian confirms.
   * Stage 4 wires this to the PaymentProvider.
   */
  async releaseToLandlord(
    params: { dealId: string; amount: bigint },
    tx?: Tx,
  ): Promise<string> {
    const landlordPayable = await this.accountFor(
      'landlord_payable',
      params.dealId,
      tx,
    );
    const pspClearing = await this.accountFor(
      'psp_clearing',
      params.dealId,
      tx,
    );

    return this.ledger.post(
      {
        legs: [
          {
            accountId: landlordPayable.id,
            direction: 'debit',
            amount: params.amount,
          },
          {
            accountId: pspClearing.id,
            direction: 'credit',
            amount: params.amount,
          },
        ],
        reference: 'release_to_landlord',
        dealId: params.dealId,
      },
      tx,
    );
  }

  /**
   * Pre-move-in refund (FR-7.7): debit escrow_liability, credit
   * psp_clearing — the held amount goes back out to the tenant and the
   * liability unwinds to zero. No revenue is touched, because on a refunded
   * deal no commission was ever earned.
   */
  async refund(
    params: { dealId: string; amount: bigint },
    tx?: Tx,
  ): Promise<string> {
    const escrowLiability = await this.accountFor(
      'escrow_liability',
      params.dealId,
      tx,
    );
    const pspClearing = await this.accountFor(
      'psp_clearing',
      params.dealId,
      tx,
    );

    return this.ledger.post(
      {
        legs: [
          {
            accountId: escrowLiability.id,
            direction: 'debit',
            amount: params.amount,
          },
          {
            accountId: pspClearing.id,
            direction: 'credit',
            amount: params.amount,
          },
        ],
        reference: 'refund',
        dealId: params.dealId,
      },
      tx,
    );
  }

  /**
   * Finds (or lazily creates) the per-deal account of a given type. Accounts
   * are per-deal so a deal's position is directly inspectable and
   * reconcilable; Data_Model.md §8.1 models `deal_id` as nullable precisely
   * so internal/revenue accounts can also exist deal-scoped or global.
   *
   * MUST run on the caller's transaction client when there is one. Using a
   * separate connection here would both deadlock (the caller's transaction
   * holds a connection while this waits for another) and be incorrect: an
   * account created outside the transaction would survive a rollback that
   * discarded the postings referencing it.
   */
  private async accountFor(
    accountType: LedgerAccountType,
    dealId: string,
    tx?: Tx,
  ) {
    const client = tx ?? this.prisma;
    const existing = await client.ledgerAccount.findFirst({
      where: { accountType, dealId },
    });
    if (existing) {
      return existing;
    }
    return client.ledgerAccount.create({
      data: { accountType, dealId },
    });
  }
}
