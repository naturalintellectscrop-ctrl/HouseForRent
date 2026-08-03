/**
 * Money handling — the client half of NFR-4.
 *
 * ── Why BigInt, in a UI ──
 * The API serialises money as strings so it never passes through a JS
 * number (API Spec §2). That guarantee is worth nothing if the first thing
 * the client does is `Number(amount)`: 2^53 is about 9 quadrillion, and
 * Ugandan shillings reach large integers quickly — a year of rent on a
 * portfolio is already in the billions, and any arithmetic on it must stay
 * exact.
 *
 * So this module parses to `bigint`, formats from `bigint`, and never
 * produces a `number`. There is deliberately no `toNumber()` here.
 *
 * ── What this module does NOT do ──
 * It does not compute a commission, a total, or what a tenant owes. Those
 * are server figures (Technical Architecture §7). This only formats what
 * arrives and adds what the user typed.
 */

export class InvalidAmountError extends Error {
  constructor(raw: string) {
    super(`"${raw}" is not a whole number of shillings.`);
    this.name = 'InvalidAmountError';
  }
}

const DIGITS_ONLY = /^[0-9]+$/;

/** Parses a server or user string of integer shillings. */
export function parseShillings(raw: string): bigint {
  const cleaned = raw.replace(/[\s,]/g, '');
  if (!DIGITS_ONLY.test(cleaned)) {
    throw new InvalidAmountError(raw);
  }
  return BigInt(cleaned);
}

/** True when a user-entered amount is a usable positive whole number. */
export function isValidAmount(raw: string): boolean {
  try {
    return parseShillings(raw) > 0n;
  } catch {
    return false;
  }
}

/** `4000000` → `UGX 4,000,000`. Grouping is applied to the STRING. */
export function formatShillings(value: string | bigint): string {
  const digits = typeof value === 'bigint' ? value.toString() : value;
  const negative = digits.startsWith('-');
  const bare = negative ? digits.slice(1) : digits;
  const grouped = bare.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}UGX ${grouped}`;
}

/** Compact form for dense lists: `1200000` → `UGX 1.2M`. */
export function formatShillingsCompact(value: string): string {
  let amount: bigint;
  try {
    amount = parseShillings(value);
  } catch {
    return formatShillings(value);
  }

  if (amount >= 1_000_000n) {
    // Integer arithmetic throughout: one decimal place via ×10 then divide,
    // never a float division that could round a price misleadingly.
    const tenths = (amount * 10n) / 1_000_000n;
    const whole = tenths / 10n;
    const frac = tenths % 10n;
    return frac === 0n ? `UGX ${whole}M` : `UGX ${whole}.${frac}M`;
  }
  if (amount >= 1_000n) {
    return `UGX ${amount / 1_000n}K`;
  }
  return formatShillings(amount);
}

/**
 * What a tenant is asked to pay upfront.
 *
 * ── This is presentation, not a business rule ──
 * The figure the tenant actually funds is whatever they send to
 * `fund-escrow`; the server records it and the ledger is authoritative.
 * This helper only pre-fills the field from the listing's own published
 * terms, so a tenant is not made to do arithmetic on their phone. It is
 * NOT used to validate, cap, or reconcile anything.
 */
export function suggestedUpfront(listing: {
  monthlyRent: string;
  depositAmount: string;
  requiredMonthsUpfront: number;
}): bigint {
  const rent = parseShillings(listing.monthlyRent);
  const deposit = parseShillings(listing.depositAmount);
  return rent * BigInt(listing.requiredMonthsUpfront) + deposit;
}
