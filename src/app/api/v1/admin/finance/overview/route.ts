import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { derivedPspState } from '@/server/ledger';
import { requireRole, route } from '@/server/http';
import { PENDING_POLICY_APPROVALS, depositCustodyConfirmed } from '@/server/finance/policy';
import { nylonPayMode } from '@/server/nylonpay';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/admin/finance/overview - the DOMAIN-FOUNDATION read for the
 * future financial administration area. Aggregates, honestly classified,
 * straight from the ledger and the lifecycle records:
 *
 *   collected / held (rent vs deposit separately) / owed to landlord /
 *   commission earned / provider fees borne by HFR / refunded by kind /
 *   open workflows (verifications, deductions, refunds, reviews) /
 *   provider + custody status / the explicit pending-policy list.
 *
 * No dashboard is built here by design; this endpoint is what one will read.
 */
export const GET = route(async (_req: NextRequest) => {
  await requireRole(['admin']);

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
  const sumInstructions = (kind: 'collect' | 'release' | 'refund', state: 'succeeded' | 'pending') =>
    instructions
      .filter((i) => i.kind === kind && derivedPspState(i) === state)
      .reduce((s, i) => s + i.amount, 0n);

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

  return NextResponse.json({
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
      mode: nylonPayMode(),
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
    },
    workflows: {
      moveInVerificationsOpen: openVerifications,
      moveInVerificationsDisputed: disputedVerifications,
      depositDeductionsAwaitingAction: openDeductions,
      refundRecordsPending: pendingRefunds,
      dealsInFinancialReview: financialReviews,
      postSettlementRefundCoordinations: openPostSettlement,
    },
    integrity: { everyPostingBalances: postingsBalanced },
    provider: {
      pspMode: nylonPayMode(),
      depositCustodyConfirmed: custodyConfirmed,
      custodyNote: custodyConfirmed
        ? null
        : 'The provider\'s custody and release capability is NOT verified - no real deposit collection is enabled.',
    },
    pendingPolicyApprovals: PENDING_POLICY_APPROVALS,
  });
});
