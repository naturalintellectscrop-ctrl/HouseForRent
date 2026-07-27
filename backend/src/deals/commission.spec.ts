import {
  BASIS_POINTS_PER_MONTH,
  computeCommission,
  MissingSnapshotError,
} from './commission';

/**
 * The commission engine (FR-7.3, FR-7.4, Decision 5).
 *
 * These are pure-function tests: no DB, no mocks, no ambiguity about what
 * is being asserted.
 */
describe('Commission engine (Stage 3)', () => {
  test('commission = monthly_rent_snapshot × rate_bp / 10000, in integer arithmetic', () => {
    // one month's rent at 10000bp (= 1.0 month)
    expect(
      computeCommission({
        monthlyRentSnapshot: 1_000_000n,
        commissionRateBpSnapshot: 10000,
      }),
    ).toBe(1_000_000n);

    // half a month
    expect(
      computeCommission({
        monthlyRentSnapshot: 1_000_000n,
        commissionRateBpSnapshot: 5000,
      }),
    ).toBe(500_000n);

    // 8.33% of a month
    expect(
      computeCommission({
        monthlyRentSnapshot: 1_200_000n,
        commissionRateBpSnapshot: 833,
      }),
    ).toBe(99_960n);
  });

  test('10000 basis points is defined as exactly one month', () => {
    expect(BASIS_POINTS_PER_MONTH).toBe(10000n);
    const rent = 2_345_678n;
    expect(
      computeCommission({
        monthlyRentSnapshot: rent,
        commissionRateBpSnapshot: 10000,
      }),
    ).toBe(rent);
  });

  test('the result is always bigint — no float ever appears', () => {
    const result = computeCommission({
      monthlyRentSnapshot: 1_333_333n,
      commissionRateBpSnapshot: 3333,
    });
    expect(typeof result).toBe('bigint');
    // 1,333,333 × 3,333 = 4,443,998,889; ÷ 10,000 = 444,399.8889 → 444,399
    expect(result).toBe(444_399n);
  });

  test('fractional shillings truncate (never round up) — the payer is not over-charged', () => {
    // 999 * 10000 / 10000 is exact; use a rate that forces a fraction
    // 1001 * 3333 / 10000 = 333.6333 → 333
    expect(
      computeCommission({
        monthlyRentSnapshot: 1001n,
        commissionRateBpSnapshot: 3333,
      }),
    ).toBe(333n);

    // 5 * 9999 / 10000 = 4.9995 → 4, not 5
    expect(
      computeCommission({
        monthlyRentSnapshot: 5n,
        commissionRateBpSnapshot: 9999,
      }),
    ).toBe(4n);
  });

  test('precision holds beyond IEEE-754 safe integer range', () => {
    // 2^53 + 1 — a float would silently lose this
    const beyondSafe = 9_007_199_254_740_993n;
    expect(
      computeCommission({
        monthlyRentSnapshot: beyondSafe,
        commissionRateBpSnapshot: 10000,
      }),
    ).toBe(beyondSafe);
  });

  test('a missing snapshot is an ERROR, never a silent zero or a fallback rate', () => {
    // this is what protects against computing commission on an unsigned deal
    expect(() =>
      computeCommission({
        monthlyRentSnapshot: null,
        commissionRateBpSnapshot: 10000,
      }),
    ).toThrow(MissingSnapshotError);

    expect(() =>
      computeCommission({
        monthlyRentSnapshot: 1_000_000n,
        commissionRateBpSnapshot: null,
      }),
    ).toThrow(MissingSnapshotError);
  });

  test('THE Decision 5 property: commission is invariant to the upfront amount', () => {
    // A tenant paying 12 months upfront must NOT be charged 12x commission.
    // The engine cannot even see the escrow total — this test documents that
    // by showing the same inputs produce the same answer regardless of what
    // a hypothetical upfront would have been.
    const monthlyRent = 1_500_000n;
    const rateBp = 10000;
    const expected = 1_500_000n;

    for (const upfrontMonths of [1, 3, 6, 12]) {
      // the upfront total is deliberately unused — it is not an input
      const _escrowTotal = monthlyRent * BigInt(upfrontMonths);
      expect(
        computeCommission({
          monthlyRentSnapshot: monthlyRent,
          commissionRateBpSnapshot: rateBp,
        }),
      ).toBe(expected);
    }
  });
});
