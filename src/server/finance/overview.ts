/**
 * The admin finance read-models - shared by the HTTP overview route and the
 * ops finance console page, so a figure can never differ between them.
 *
 * Every number here is classified straight from the ledger and the lifecycle
 * records. Nothing is estimated, nothing is projected, and the custody note
 * says what the books are: INTERNAL liabilities - what our ledger says the
 * provider holds. Reconciliation against an actual provider statement is a
 * separate, explicit step (provider-statement.ts), never implied by these
 * figures.
 */
import { db } from '@/lib/db';
import { derivedPspState } from '../ledger';
import { PENDING_POLICY_APPROVALS, depositCustodyConfirmed } from './policy';
import { nylonPayMode } from '../nylonpay';

export async function financeOverview() {
  const sumCredits = async (referencePrefix: string) => {
    const agg = await db.ledgerEntry.aggregate({
      where: { reference: { startsWith: referencePrefix }, direction: 'credit' },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0n;
  };
  const netByAccountType = async (accountTypes: string[]) => {
    const rows = await db.ledgerEntry.groupBy({
      by: ['direction'],
      where: { account: { accountType: { in: accountTypes as never } } },
      _sum: { amount: true },
    });
    let net = 0n;
    for (const row of rows) {
      const amount = row._sum.amount ?? 0n;
      net += row.direction === 'credit' ? amount : -amount;
    }
    return net;
  };

  const instructions = await db.pspInstruction.findMany({
    include: { events: { orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }], take: 1 } },
  });
  const sumInstructions = (kind: 'collect' | 'release' | 'refund', state: 'succeeded' | 'pending' | 'failed') =>
    instructions
      .filter((i) => i.kind === kind && derivedPspState(i) === state)
      .reduce((s, i) => s + i.amount, 0n);
  const countInstructions = (kind: 'collect' | 'release' | 'refund', state: 'succeeded' | 'pending' | 'failed') =>
    instructions.filter((i) => i.kind === kind && derivedPspState(i) === state).length;

  const [
    collected,
    heldRent,
    heldDeposit,
    heldLegacy,
    owedToLandlord,
    commissionEarned,
    providerFees,
    releasedToLandlord,
    refundedRent,
    depositReleased,
    reversalPayouts,
    openVerifications,
    disputedVerifications,
    openDeductions,
    pendingRefunds,
    failedRefunds,
    financialReviews,
    openPostSettlement,
    custodyConfirmed,
    ledgerRows,
  ] = await Promise.all([
    sumCredits('fund_escrow'),
    netByAccountType(['rent_escrow_liability']),
    netByAccountType(['deposit_liability']),
    netByAccountType(['escrow_liability']),
    netByAccountType(['landlord_payable']),
    netByAccountType(['commission_revenue']),
    netByAccountType(['psp_fee_expense']),
    sumCredits('release_to_landlord'),
    db.ledgerEntry.aggregate({
      where: { OR: [{ reference: 'refund' }, { reference: { startsWith: 'refund:' } }], direction: 'credit' },
      _sum: { amount: true },
    }),
    sumCredits('deposit_refund'),
    sumCredits('commission_reversal_payout'),
    db.moveInVerification.count({ where: { state: { in: ['open', 'tenant_confirmed', 'landlord_confirmed'] } } }),
    db.moveInVerification.count({ where: { state: 'disputed' } }),
    db.depositDeduction.count({
      where: { state: { in: ['proposed', 'under_review', 'disputed_by_tenant', 'approved', 'accepted_by_tenant'] } },
    }),
    db.refundRecord.count({ where: { state: 'pending' } }),
    db.refundRecord.count({ where: { state: 'failed' } }),
    db.deal.count({ where: { status: 'financial_review_required' } }),
    db.postSettlementRefund.count({
      where: { state: { in: ['recorded', 'landlord_acknowledged', 'coordinating', 'escalated'] } },
    }),
    depositCustodyConfirmed(),
    db.ledgerEntry.findMany({ select: { postingId: true, direction: true, amount: true } }),
  ]);

  // Global integrity: every posting balances.
  const byPosting = new Map<string, bigint>();
  for (const row of ledgerRows) {
    const net = byPosting.get(row.postingId) ?? 0n;
    byPosting.set(row.postingId, row.direction === 'debit' ? net + row.amount : net - row.amount);
  }
  let postingsBalanced = true;
  for (const net of byPosting.values()) if (net !== 0n) postingsBalanced = false;

  const s = (v: bigint) => v.toString();
  const mode = nylonPayMode();

  return {
    money: {
      collected: s(collected),
      heldInCustody: {
        rent: s(heldRent),
        deposit: s(heldDeposit),
        legacyEscrow: s(heldLegacy),
        total: s(heldRent + heldDeposit + heldLegacy),
        note: 'Internal ledger liabilities - what the books say the provider holds. Reconciliation compares; it never asserts.',
      },
      owedToLandlord: s(owedToLandlord),
      commissionEarned: s(commissionEarned),
      providerFeesBorneByHfr: s(providerFees),
      settledToLandlord: s(releasedToLandlord),
      refunded: {
        rent: s(refundedRent._sum.amount ?? 0n),
        deposit: s(depositReleased),
        commissionReversalPayouts: s(reversalPayouts),
      },
    },
    psp: {
      mode,
      confirmed: {
        collect: s(sumInstructions('collect', 'succeeded')),
        release: s(sumInstructions('release', 'succeeded')),
        refund: s(sumInstructions('refund', 'succeeded')),
      },
      inFlight: {
        collect: s(sumInstructions('collect', 'pending')),
        release: s(sumInstructions('release', 'pending')),
        refund: s(sumInstructions('refund', 'pending')),
      },
      failed: {
        collect: s(sumInstructions('collect', 'failed')),
        release: s(sumInstructions('release', 'failed')),
        refund: s(sumInstructions('refund', 'failed')),
      },
      counts: {
        collect: { succeeded: countInstructions('collect', 'succeeded'), pending: countInstructions('collect', 'pending'), failed: countInstructions('collect', 'failed') },
        release: { succeeded: countInstructions('release', 'succeeded'), pending: countInstructions('release', 'pending'), failed: countInstructions('release', 'failed') },
        refund: { succeeded: countInstructions('refund', 'succeeded'), pending: countInstructions('refund', 'pending'), failed: countInstructions('refund', 'failed') },
      },
    },
    workflows: {
      moveInVerificationsOpen: openVerifications,
      moveInVerificationsDisputed: disputedVerifications,
      depositDeductionsAwaitingAction: openDeductions,
      refundRecordsPending: pendingRefunds,
      refundRecordsFailed: failedRefunds,
      dealsInFinancialReview: financialReviews,
      postSettlementRefundCoordinations: openPostSettlement,
    },
    integrity: { everyPostingBalances: postingsBalanced },
    provider: {
      pspMode: mode,
      depositCustodyConfirmed: custodyConfirmed,
      custodyNote: custodyConfirmed
        ? null
        : 'The provider\'s custody and release capability is NOT verified - no real deposit collection is enabled.',
      payoutDispatchNote:
        mode === 'live'
          ? 'Payout dispatch is NOT integrated with the provider yet: release and refund instructions park pending and complete only through a provider confirmation. No money leaves on our say-so.'
          : null,
    },
    pendingPolicyApprovals: PENDING_POLICY_APPROVALS,
  };
}

export type FinanceOverview = Awaited<ReturnType<typeof financeOverview>>;
