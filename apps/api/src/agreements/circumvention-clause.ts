/**
 * The circumvention clause and commission terms, in plain language
 * (FR-9.1, SSOT Decision 11).
 *
 * ── Why the text lives in code, versioned ──
 * `listing_agreement.circumvention_clause_version` records WHICH text a
 * landlord accepted. That reference is worthless if the text it points at
 * can change: proving what someone agreed to requires the words to be
 * fixed. So versions are append-only constants here, an accepted version is
 * never edited, and `listing_agreement` is 🔒 immutable in the database.
 *
 * ── Why plain language, and why it names the payer ──
 * FR-9.1 requires the terms be presented "in plain language"; FR-9.2
 * requires the landlord be named as the contractual payer while
 * tenant-facing surfaces say free-for-tenants. Both are asserted by test
 * against this text, not left to whatever copy a screen happens to carry.
 */

export const CURRENT_CLAUSE_VERSION = 'v1';

export interface ClauseText {
  version: string;
  commissionTerms: string;
  circumventionClause: string;
  payer: 'landlord';
  tenantPays: false;
}

const VERSIONS: Record<string, Omit<ClauseText, 'version'>> = {
  v1: {
    commissionTerms:
      'House For Rent charges a commission only when a let succeeds. The ' +
      'commission is calculated from one month of the rent agreed at ' +
      'signing, at the rate shown to you here, and it is fixed at that ' +
      'moment: a later change to our standard rate, or to the rent on this ' +
      'listing, does not change what you owe on this let. Nothing is ' +
      'charged if the tenant does not move in. The commission is deducted ' +
      'once, from the settlement, and you receive the remainder.',
    circumventionClause:
      'When our field officer introduces a tenant to your property, we ' +
      'record that introduction: who was introduced, to which property, and ' +
      'when. If you and that tenant complete a tenancy for that property ' +
      'outside House For Rent within twelve months of the introduction, the ' +
      'same commission remains payable. This is what allows us to send an ' +
      'officer to meet a stranger at your property at our own cost, and to ' +
      'charge the tenant nothing.',
    payer: 'landlord',
    tenantPays: false,
  },
};

export class UnknownClauseVersionError extends Error {
  constructor(version: string) {
    super(
      `circumvention clause version "${version}" does not exist. An ` +
        'agreement can only reference text that is on record — otherwise ' +
        'what was accepted cannot be proven (FR-9.1).',
    );
    this.name = 'UnknownClauseVersionError';
  }
}

export function clauseText(version: string = CURRENT_CLAUSE_VERSION): ClauseText {
  const found = VERSIONS[version];
  if (!found) {
    throw new UnknownClauseVersionError(version);
  }
  return { version, ...found };
}

export const CLAUSE_VERSIONS = Object.freeze(Object.keys(VERSIONS));
