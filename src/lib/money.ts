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


/**
 * ── What used to be here, and why it is gone ──
 * The mobile client carried a `suggestedUpfront()` that multiplied rent by
 * months and added the deposit. It was documented as presentation-only, but
 * it was still a second copy of the figure a tenant is about to pay, living
 * on the least trustworthy side of the boundary.
 *
 * The server now returns `expectedUpfront` on the public listing detail,
 * derived from the same listing terms `fund-escrow` derives its
 * authoritative amount from (F-012). This module formats that figure. It
 * does not, and must not, recompute it.
 */
