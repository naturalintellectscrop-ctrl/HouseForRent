/**
 * The commission engine (FR-7.3, FR-7.4, Data_Model.md §3.2, §7.1).
 *
 * Deliberately a pure function over the deal's OWN SNAPSHOTS — it cannot
 * reach a live rate, a listing, or an escrow total even if a caller wanted
 * it to, because it has no access to any of them. That is the point: the
 * two most expensive money bugs available here are
 *   (a) computing commission from the escrow inflow instead of monthly rent
 *       (Decision 5 — a tenant paying 12 months upfront would be charged
 *       12× the commission), and
 *   (b) reading the current standard rate at settlement instead of the rate
 *       frozen at signing (FR-7.4 — a rate change would silently re-price
 *       every in-flight deal),
 * and both are made structurally impossible by this signature.
 */

export class MissingSnapshotError extends Error {
  constructor(field: string) {
    super(
      `cannot compute commission: ${field} is not set — the deal has not been ` +
        'through agreement_signed, where snapshots are taken (FR-7.4)',
    );
    this.name = 'MissingSnapshotError';
  }
}

/** 10000 basis points = 1.0 month's rent (Data_Model.md §3.2). */
export const BASIS_POINTS_PER_MONTH = 10000n;

/**
 * commission = monthly_rent_snapshot * commission_rate_bp_snapshot / 10000
 *
 * Integer arithmetic throughout: both operands are bigint and the division
 * is bigint division, which truncates toward zero. No float ever touches
 * the value. Truncation means any fractional shilling is resolved in the
 * payer's favour (the landlord is never over-charged by rounding), which is
 * the conservative direction for a fee we collect.
 */
export function computeCommission(params: {
  monthlyRentSnapshot: bigint | null;
  commissionRateBpSnapshot: number | null;
}): bigint {
  if (
    params.monthlyRentSnapshot === null ||
    params.monthlyRentSnapshot === undefined
  ) {
    throw new MissingSnapshotError('monthlyRentSnapshot');
  }
  if (
    params.commissionRateBpSnapshot === null ||
    params.commissionRateBpSnapshot === undefined
  ) {
    throw new MissingSnapshotError('commissionRateBpSnapshot');
  }

  return (
    (params.monthlyRentSnapshot * BigInt(params.commissionRateBpSnapshot)) /
    BASIS_POINTS_PER_MONTH
  );
}
