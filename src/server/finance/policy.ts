/**
 * Financial policy configuration and the PENDING-APPROVAL registry.
 *
 * The business decisions this platform must NOT invent (task §12) live here,
 * explicitly, in one place:
 *  - the config keys they WILL live in once approved (append-only
 *    config_parameter/config_version; unset = not enforced, never guessed);
 *  - the registry of approvals still outstanding, surfaced verbatim by the
 *    admin finance overview so a gap is visible on a screen, not buried in
 *    a hardcoded assumption.
 *
 * Nothing in this module defaults a deadline "to something sensible": an
 * unapproved window is NULL and the product says so.
 */
import { db } from '@/lib/db';

/** Config keys a business approval will set; each read falls back to NULL. */
export const FINANCE_CONFIG_KEYS = {
  /** Hours both parties have to respond to a move-in verification. */
  moveinResponseWindowHours: 'movein_response_window_hours',
  /** Days a landlord has to inspect and propose deposit deductions. */
  depositInspectionDeadlineDays: 'deposit_inspection_deadline_days',
  /** Days within which an approved deposit release must reach the tenant. */
  depositRefundDeadlineDays: 'deposit_refund_deadline_days',
  /**
   * Whether the SELECTED provider's custody + release capability has been
   * VERIFIED for real deposit collection. Default false: no real deposit
   * custody claim may be made until this is explicitly set ('true').
   */
  depositCustodyProviderConfirmed: 'deposit_custody_provider_confirmed',
} as const;

/**
 * The honest list of decisions still awaiting the business / legal owners.
 * Rendered by GET /api/v1/admin/finance/overview; keep in step with
 * docs/FINANCIAL_ARCHITECTURE.md §8.
 */
export const PENDING_POLICY_APPROVALS: ReadonlyArray<{
  key: string;
  question: string;
  status: string;
}> = Object.freeze([
  {
    key: FINANCE_CONFIG_KEYS.moveinResponseWindowHours,
    question: 'Move-in verification response window (how long either party may take to confirm or dispute)',
    status: 'awaiting business approval - no automatic confirmation or blocking runs until set',
  },
  {
    key: FINANCE_CONFIG_KEYS.depositInspectionDeadlineDays,
    question: 'Deposit inspection window and deduction proposal deadline',
    status: 'awaiting business approval - must respect applicable Ugandan law',
  },
  {
    key: FINANCE_CONFIG_KEYS.depositRefundDeadlineDays,
    question: 'Deposit release deadline after an approved decision',
    status: 'awaiting business approval - must respect applicable Ugandan law',
  },
  {
    key: 'tenant_initiated_cancellation_rules',
    question: 'Cancellation rules and commission retention for tenant-initiated cancellations',
    status: 'awaiting business approval - no retention rule may be invented; only the two approved categories (landlord failure to provide the property; provider payment reversal) reverse commission',
  },
  {
    key: 'dispute_escalation_deadlines',
    question: 'Dispute escalation deadlines and the authorized review SLA',
    status: 'awaiting business approval',
  },
  {
    key: FINANCE_CONFIG_KEYS.depositCustodyProviderConfirmed,
    question: 'Provider custody and release capability verification for real deposit collection',
    status: 'pending - the payment provider and legal custody structure are not yet approved; no real deposit custody is enabled',
  },
  {
    key: 'payment_custody_structure_legal_approval',
    question: 'Legal approval of the payment and custody structure',
    status: 'pending - no surface may claim licensed escrow or custody until counsel approves',
  },
]);

/** Latest config value for a key, or NULL when unset/unapproved. Never guesses. */
export async function financeConfigValue(key: string): Promise<string | null> {
  const param = await db.configParameter.findUnique({ where: { key } });
  if (!param) return null;
  const version = await db.configVersion.findFirst({
    where: { parameterId: param.id },
    orderBy: { effectiveFrom: 'desc' },
  });
  return version ? String(version.value) : null;
}

/** The move-in response window in hours, or null while unapproved. */
export async function moveInResponseWindowHours(): Promise<number | null> {
  const raw = await financeConfigValue(FINANCE_CONFIG_KEYS.moveinResponseWindowHours);
  if (raw === null) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Whether the provider's deposit custody capability is VERIFIED (default: no). */
export async function depositCustodyConfirmed(): Promise<boolean> {
  return (await financeConfigValue(FINANCE_CONFIG_KEYS.depositCustodyProviderConfirmed)) === 'true';
}

/** Policy tokens snapshotted onto a deal at signing (the accepted regime). */
export const FINANCIAL_POLICY_TOKENS = {
  fees: 'provider_fees_borne_by_hfr_v1',
  commissionPayer: 'landlord',
  moveIn: 'evidence_based_verification_v1',
  refund: 'pre_settlement_full_refund__post_settlement_landlord_responsible_v1',
} as const;

export function policySnapshotValue(): Record<string, string> {
  return {
    fees_policy: FINANCIAL_POLICY_TOKENS.fees,
    commission_payer: FINANCIAL_POLICY_TOKENS.commissionPayer,
    move_in_policy: FINANCIAL_POLICY_TOKENS.moveIn,
    refund_policy: FINANCIAL_POLICY_TOKENS.refund,
  };
}
