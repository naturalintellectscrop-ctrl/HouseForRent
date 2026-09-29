/**
 * Shapes the signed-in portals consume, and the copy that goes with a
 * status.
 *
 * ── What is NOT here ──
 * No decision about which transition is legal, no arithmetic on money, no
 * mapping from status to available actions. Those come from the server on
 * every deal read (`availableActions`, `financial`), and a copy here would
 * be a second implementation of the state machine — free to drift, and the
 * wrong one the moment it did.
 *
 * What IS here is presentation: how far along a trail to draw a marker, and
 * what to call a status in a sentence a person reads.
 */

export interface TenantViewing {
  id: string;
  listingId: string;
  status: 'requested' | 'scheduled' | 'conducted' | 'no_show' | 'cancelled';
  scheduledFor: string;
  createdAt: string;
  officerAssigned: boolean;
  listing: {
    monthlyRent: string;
    bedrooms: number;
    bathrooms: number;
    propertyType: string;
    neighbourhoodName: string;
    landmarkText: string;
    publicationState: string;
  };
  /** Written server-side. Rendered verbatim. */
  whatHappensNext: string;
}

export interface PartyDeal {
  id: string;
  status: string;
  listingId: string;
  createdAt: string;
  updatedAt: string;
  whichSide: 'tenant' | 'landlord';
  counterpartyName: string;
  listing: {
    monthlyRent: string;
    bedrooms: number;
    propertyType: string;
    neighbourhoodName: string;
    landmarkText: string;
  };
  monthlyRentSnapshot: string | null;
  commissionAmount: string | null;
}

export interface IdentityStatus {
  partyId: string;
  displayName: string;
  identityVerified: boolean;
  screeningState: string | null;
  screeningModulesRun: string[];
  consentRecordedAt: string | null;
  consentPolicyVersion: string | null;
}

/**
 * The order the deal statuses actually occur in, for drawing a progress
 * trail.
 *
 * ── Why this is not the state machine ──
 * It is a display ORDER, not a transition graph: it says nothing about
 * which move is permitted from where, and the UI never uses it to decide
 * whether to offer an action. Every action rendered anywhere in this app
 * comes from the server's `availableActions`. This only answers "how far
 * along is the bar", and getting that wrong makes a picture slightly
 * misleading rather than letting somebody move money they should not.
 */
export const DEAL_TRAIL = [
  { status: 'created', label: 'Introduction recorded' },
  { status: 'tenant_matched', label: 'Tenant matched to the property' },
  { status: 'agreement_signed', label: 'Terms agreed and signed' },
  { status: 'escrow_funded', label: 'Rent and deposit held in escrow' },
  { status: 'move_in_confirmed', label: 'Move-in confirmed' },
  { status: 'commission_earned', label: 'Commission earned' },
  { status: 'settled', label: 'Landlord paid' },
  { status: 'closed', label: 'Complete' },
] as const;

/** Statuses that are an ending rather than a stage on the way to one. */
export const TERMINAL_STATUSES = new Set([
  'closed',
  'cancelled',
  'refunded',
  'disputed',
]);

export function trailPosition(status: string): number {
  const i = DEAL_TRAIL.findIndex((s) => s.status === status);
  return i;
}

/** What a deal status means to the person reading it, by side. */
export function dealHeadline(
  status: string,
  side: 'tenant' | 'landlord',
): string {
  const tenant: Record<string, string> = {
    created: 'We have recorded your introduction to this landlord.',
    tenant_matched: 'You have been matched to this property.',
    agreement_signed:
      'Terms are agreed. The next step is funding the escrow.',
    escrow_funded:
      'Your rent and deposit are held by House For Rent. Confirm once you have moved in.',
    move_in_confirmed:
      'Move-in confirmed. We are releasing the money to the landlord.',
    commission_earned: 'Settlement is being prepared.',
    settled: 'The landlord has been paid. Your tenancy is under way.',
    closed: 'Complete.',
    cancelled: 'This did not go ahead.',
    refunded: 'Your money has been refunded in full.',
    disputed: 'This is on hold while we look into it. Your money stays with us.',
  };
  const landlord: Record<string, string> = {
    created: 'A tenant has been introduced to this property.',
    tenant_matched: 'A tenant is matched. Terms come next.',
    agreement_signed: 'Terms are signed. The tenant funds the escrow next.',
    escrow_funded:
      'The tenant has funded the escrow. We hold it until they confirm move-in.',
    move_in_confirmed: 'The tenant has moved in. Settlement follows.',
    commission_earned: 'Commission recorded. Payment to you is next.',
    settled: 'You have been paid.',
    closed: 'Complete.',
    cancelled: 'This did not go ahead.',
    refunded: 'The tenant was refunded in full.',
    disputed: 'On hold while we look into it.',
  };
  const table = side === 'tenant' ? tenant : landlord;
  return table[status] ?? status.replace(/_/g, ' ');
}

export function statusTone(status: string): 'neutral' | 'ok' | 'warn' | 'danger' {
  if (status === 'closed' || status === 'settled') return 'ok';
  if (status === 'cancelled' || status === 'disputed') return 'danger';
  if (status === 'refunded') return 'warn';
  return 'neutral';
}

/** The blockers `GET /v1/listings/mine` reports, in words a landlord uses. */
export const BLOCKER_LABEL: Record<string, string> = {
  field_verification:
    'Waiting for a field officer to visit and verify the property',
  outside_service_area:
    'This neighbourhood is outside the area we currently cover',
  listing_agreement: 'You have not yet accepted the listing agreement',
  mandate: 'We need a verified mandate for this specific property',
};

export const PUBLICATION_LABEL: Record<string, string> = {
  draft: 'Draft',
  awaiting_verification: 'Awaiting verification',
  live: 'Live',
  rented: 'Let',
  withdrawn: 'Withdrawn',
};
