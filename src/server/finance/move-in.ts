/**
 * Move-in verification (docs/FINANCIAL_ARCHITECTURE.md §4).
 *
 * The handover is EVIDENCE-BASED, not a click: the tenant opens the
 * verification with their confirmation, the landlord confirms
 * independently, and either party can dispute with reasons and evidence.
 * Silence never auto-confirms and never blocks forever - the only ways out
 * are both confirmations or an authorized review decision, every one of
 * which is recorded with its reason and audited.
 *
 * The response window is policy-pending: `movein_response_window_hours` is
 * unset, so `responseDeadline` stays NULL and NOTHING runs on a timer. When
 * the business approves a window, this module records it on the verification
 * for the reviewer's context - it still never acts on its own.
 *
 * A Field Operations Officer may attach evidence; the verification decision
 * and every settlement authority remain admin-only.
 */
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { applyTransition, requireDeal, transactional } from '../deals';
import type { DealStatus } from '../domain';
import { ApiError } from '../http';
import { moveInResponseWindowHours } from './policy';

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

export class MoveInVerificationNotFoundError extends Error {
  constructor(dealId: string) {
    super(`deal ${dealId} has no move-in verification open`);
    this.name = 'MoveInVerificationNotFoundError';
  }
}

async function audit(
  tx: Tx,
  actorPartyId: string,
  eventType: string,
  dealId: string,
  payload: Prisma.InputJsonObject,
) {
  await tx.auditEvent.create({
    data: { actorPartyId, eventType, subjectRef: dealId, payload, occurredAt: new Date() },
  });
}

/**
 * The tenant's confirm action. On an unfunded-but-signed-and-funded deal it
 * OPENS the verification (escrow_funded → move_in_awaiting_verification) and
 * records the tenant's confirmation as its first entry; on an open
 * verification it records the confirmation, completing the verification when
 * the landlord has confirmed independently.
 */
export async function confirmMoveIn(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  reason?: string;
  note?: string;
  evidenceRef?: string;
}) {
  const windowHours = await moveInResponseWindowHours();
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);

    if (deal.status === 'escrow_funded') {
      // A verification row can still exist here after an authorized review
      // decided the handover NOT verified (rejectMoveIn returns the deal to
      // escrow_funded with the record kept). That decision is final - money
      // stays held and only a refund can release it - so a re-open attempt
      // must refuse with that reason, not die on the (deal_id) unique
      // constraint. Silence and retries never resurrect a decided handover.
      const existing = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
      if (existing) {
        throw new ApiError(
          409,
          'MOVEIN_DECISION_FINAL',
          'an authorized review already decided this handover was NOT verified - the decision is final and only a refund can release the held rent',
        );
      }
      const verification = await tx.moveInVerification.create({
        data: {
          dealId: deal.id,
          state: 'tenant_confirmed',
          tenantConfirmedAt: new Date(),
          tenantNote: params.note ?? null,
          tenantEvidenceRef: params.evidenceRef ?? null,
          responseDeadline:
            windowHours !== null ? new Date(Date.now() + windowHours * 3_600_000) : null,
        },
      });
      await audit(tx, params.actorPartyId, 'move_in_verification_opened', deal.id, {
        byRole: params.actorRole ?? 'tenant',
        tenantConfirmed: true,
        note: params.note ?? null,
        evidenceRef: params.evidenceRef ?? null,
        responseWindowHours: windowHours,
        verificationId: verification.id,
      });
      return applyTransition(
        {
          deal,
          to: 'move_in_awaiting_verification',
          actorPartyId: params.actorPartyId,
          actorRole: params.actorRole,
          reason: params.reason ?? 'Move-in verification opened by the tenant’s confirmation.',
        },
        tx,
      );
    }

    if (deal.status === 'move_in_awaiting_verification') {
      const verification = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
      if (!verification) throw new MoveInVerificationNotFoundError(deal.id);
      if (verification.tenantConfirmedAt) {
        throw new ApiError(409, 'ALREADY_CONFIRMED', 'the tenant has already confirmed this handover');
      }
      await tx.moveInVerification.update({
        where: { id: verification.id },
        data: {
          // State convention = the party who confirmed most recently (the
          // opener writes 'tenant_confirmed'); this entry is the TENANT's.
          state: 'tenant_confirmed',
          tenantConfirmedAt: new Date(),
          tenantNote: params.note ?? null,
          tenantEvidenceRef: params.evidenceRef ?? null,
        },
      });
      await audit(tx, params.actorPartyId, 'move_in_confirmed_by_tenant', deal.id, {
        note: params.note ?? null,
        evidenceRef: params.evidenceRef ?? null,
      });
      if (verification.landlordConfirmedAt) {
        // Both parties in: the verification completes itself.
        return completeVerified(tx, deal.id, params.actorPartyId, params.actorRole ?? 'tenant', {
          reason: 'Both parties confirmed the handover independently.',
        });
      }
      return deal;
    }

    throw new ApiError(
      409,
      'ILLEGAL_TRANSITION',
      `move-in confirmation is not available from status ${deal.status}`,
    );
  });
}

/** The landlord's independent confirmation on an open verification. */
export async function confirmMoveInByLandlord(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  note?: string;
  evidenceRef?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (deal.status !== 'move_in_awaiting_verification') {
      throw new ApiError(
        409,
        'ILLEGAL_TRANSITION',
        `the landlord confirms a handover while verification is open; deal is ${deal.status}`,
      );
    }
    const verification = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
    if (!verification) throw new MoveInVerificationNotFoundError(deal.id);
    if (verification.landlordConfirmedAt) {
      throw new ApiError(409, 'ALREADY_CONFIRMED', 'the landlord has already confirmed this handover');
    }
    await tx.moveInVerification.update({
      where: { id: verification.id },
      data: {
        // State convention = the party who confirmed most recently; this
        // entry is the LANDLORD's independent confirmation.
        state: 'landlord_confirmed',
        landlordConfirmedAt: new Date(),
        landlordNote: params.note ?? null,
        landlordEvidenceRef: params.evidenceRef ?? null,
      },
    });
    await audit(tx, params.actorPartyId, 'move_in_confirmed_by_landlord', deal.id, {
      note: params.note ?? null,
      evidenceRef: params.evidenceRef ?? null,
    });
    if (verification.tenantConfirmedAt) {
      return completeVerified(tx, deal.id, params.actorPartyId, params.actorRole ?? 'lister', {
        reason: 'Both parties confirmed the handover independently.',
      });
    }
    return deal;
  });
}

/** Either party disputes the handover while verification is open. */
export async function disputeMoveIn(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  reason: string;
  evidenceRef?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (deal.status !== 'move_in_awaiting_verification') {
      throw new ApiError(
        409,
        'ILLEGAL_TRANSITION',
        `a handover can be disputed while verification is open; deal is ${deal.status}`,
      );
    }
    const verification = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
    if (!verification) throw new MoveInVerificationNotFoundError(deal.id);

    await tx.moveInVerification.update({
      where: { id: verification.id },
      data: {
        state: 'disputed',
        disputedByPartyId: params.actorPartyId,
        disputeReason: params.reason,
        disputeEvidenceRef: params.evidenceRef ?? null,
        disputeOpenedAt: new Date(),
      },
    });
    await audit(tx, params.actorPartyId, 'move_in_verification_disputed', deal.id, {
      reason: params.reason,
      evidenceRef: params.evidenceRef ?? null,
    });
    return applyTransition(
      {
        deal,
        to: 'move_in_disputed',
        actorPartyId: params.actorPartyId,
        actorRole: params.actorRole,
        reason: `Handover disputed: ${params.reason}`,
      },
      tx,
    );
  });
}

/**
 * Officer evidence: a Field Operations Officer (or an admin) attaches field
 * evidence to an open or disputed verification. Evidence NEVER decides the
 * verification and never unlocks money - the decision is admin-only.
 */
export async function addMoveInEvidence(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  note: string;
  evidenceRef?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (
      deal.status !== 'move_in_awaiting_verification' &&
      deal.status !== 'move_in_disputed' &&
      deal.status !== 'escrow_funded'
    ) {
      throw new ApiError(
        409,
        'ILLEGAL_TRANSITION',
        `evidence attaches to an open or disputed verification; deal is ${deal.status}`,
      );
    }
    const verification = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
    if (!verification) {
      // escrow_funded: an officer may open the record with their evidence -
      // the deal moves into the verification window.
      const created = await tx.moveInVerification.create({
        data: {
          dealId: deal.id,
          state: 'open',
          officerEvidenceRef: params.evidenceRef ?? null,
          officerEvidenceNote: params.note,
          officerEvidenceAt: new Date(),
          officerEvidenceBy: params.actorPartyId,
        },
      });
      await audit(tx, params.actorPartyId, 'move_in_verification_opened', deal.id, {
        byRole: params.actorRole ?? 'foo',
        officerEvidence: true,
        note: params.note,
        evidenceRef: params.evidenceRef ?? null,
        verificationId: created.id,
      });
      return applyTransition(
        {
          deal,
          to: 'move_in_awaiting_verification',
          actorPartyId: params.actorPartyId,
          actorRole: params.actorRole,
          reason: 'Move-in verification opened with field evidence.',
        },
        tx,
      );
    }
    await tx.moveInVerification.update({
      where: { id: verification.id },
      data: {
        officerEvidenceRef: params.evidenceRef ?? verification.officerEvidenceRef,
        officerEvidenceNote: params.note,
        officerEvidenceAt: new Date(),
        officerEvidenceBy: params.actorPartyId,
      },
    });
    await audit(tx, params.actorPartyId, 'move_in_evidence_attached', deal.id, {
      note: params.note,
      evidenceRef: params.evidenceRef ?? null,
    });
    return deal;
  });
}

/** The authorized review decision: handover VERIFIED (unlocks settlement). */
export async function verifyMoveIn(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  reason: string;
  evidenceRef?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (deal.status !== 'move_in_awaiting_verification' && deal.status !== 'move_in_disputed') {
      throw new ApiError(
        409,
        'ILLEGAL_TRANSITION',
        `the verification decision runs while verification is open or disputed; deal is ${deal.status}`,
      );
    }
    const verification = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
    if (!verification) throw new MoveInVerificationNotFoundError(deal.id);
    return completeVerified(tx, deal.id, params.actorPartyId, params.actorRole ?? 'admin', {
      reason: params.reason,
      evidenceRef: params.evidenceRef,
    });
  });
}

/** The authorized review decision: handover NOT verified (money stays held). */
export async function rejectMoveIn(params: {
  dealId: string;
  actorPartyId: string;
  actorRole?: string;
  reason: string;
  evidenceRef?: string;
}) {
  return transactional(async (tx) => {
    const deal = await requireDeal(params.dealId, tx);
    if (deal.status !== 'move_in_awaiting_verification' && deal.status !== 'move_in_disputed') {
      throw new ApiError(
        409,
        'ILLEGAL_TRANSITION',
        `the verification decision runs while verification is open or disputed; deal is ${deal.status}`,
      );
    }
    const verification = await tx.moveInVerification.findUnique({ where: { dealId: deal.id } });
    if (!verification) throw new MoveInVerificationNotFoundError(deal.id);

    await tx.moveInVerification.update({
      where: { id: verification.id },
      data: {
        state: 'not_verified',
        decidedByPartyId: params.actorPartyId,
        decidedAt: new Date(),
        decisionReason: params.reason,
      },
    });
    await audit(tx, params.actorPartyId, 'move_in_verification_not_verified', deal.id, {
      reason: params.reason,
      evidenceRef: params.evidenceRef ?? null,
      priorState: verification.state,
    });
    return applyTransition(
      {
        deal,
        to: 'escrow_funded',
        actorPartyId: params.actorPartyId,
        actorRole: params.actorRole,
        reason: `Move-in review decision: NOT verified - ${params.reason}`,
      },
      tx,
    );
  });
}

/** Shared completion: mark verified, record the decision, advance the deal. */
async function completeVerified(
  tx: Tx,
  dealId: string,
  actorPartyId: string,
  actorRole: string,
  decision: { reason: string; evidenceRef?: string },
) {
  const deal = await requireDeal(dealId, tx);
  const verification = await tx.moveInVerification.findUnique({ where: { dealId } });
  if (!verification) throw new MoveInVerificationNotFoundError(dealId);
  const priorState = verification.state;

  await tx.moveInVerification.update({
    where: { id: verification.id },
    data: {
      state: 'verified',
      decidedByPartyId: actorPartyId,
      decidedAt: new Date(),
      decisionReason: decision.reason,
    },
  });
  await audit(tx, actorPartyId, 'move_in_verification_verified', dealId, {
    reason: decision.reason,
    evidenceRef: decision.evidenceRef ?? null,
    priorState,
    decidedByRole: actorRole,
  });
  return applyTransition(
    {
      deal,
      to: 'move_in_confirmed' as DealStatus,
      actorPartyId,
      actorRole,
      reason: `Move-in verified - ${decision.reason}`,
    },
    tx,
  );
}
