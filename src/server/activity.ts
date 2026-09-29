/**
 * Recent activity — the tenant's and landlord's "what has happened" feed.
 *
 * This is a PROJECTION, not a source of truth. Every row is derived from a
 * record another service already wrote: a DealTransition row, or a viewing
 * whose status a field officer set. Nothing here is invented, nothing here
 * is written back, and there are no unread counters or notification badges
 * — the product does not claim a notification system it does not have.
 *
 * Phrasing rules (worklog D-1: status→copy decisions live server-side):
 * each row's sentence is written here, in one place, from the status the
 * server holds. The client renders it verbatim.
 */
import { db } from '@/lib/db';

export interface ActivityRow {
  id: string;
  kind: 'viewing' | 'deal';
  /** Human title: the home it concerns. */
  title: string;
  /** The server-written sentence describing what happened. */
  line: string;
  at: string;
  statusLabel: string;
  tone: 'ok' | 'warn' | 'neutral' | 'danger';
  href: string;
}

/** viewing | deal — short past-tense labels for badges. */
function viewingLabel(status: string): string {
  const labels: Record<string, string> = {
    requested: 'requested',
    scheduled: 'scheduled',
    conducted: 'conducted',
    no_show: 'missed',
    cancelled: 'cancelled',
  };
  return labels[status] ?? status.replace(/_/g, ' ');
}

function dealLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function dealTone(status: string): ActivityRow['tone'] {
  switch (status) {
    case 'closed':
    case 'settled':
    case 'move_in_confirmed':
      return 'ok';
    case 'cancelled':
    case 'refunded':
      return 'neutral';
    case 'disputed':
      return 'danger';
    default:
      return 'neutral';
  }
}

function viewingTone(status: string): ActivityRow['tone'] {
  switch (status) {
    case 'conducted':
      return 'ok';
    case 'no_show':
    case 'cancelled':
      return 'warn';
    default:
      return 'neutral';
  }
}

/**
 * What a deal transition MEANS to the person reading it, tenant side.
 * One sentence per transition, written from the state the server recorded.
 */
function dealEventLine(toStatus: string, side: 'tenant' | 'landlord'): string {
  const tenant: Record<string, string> = {
    created: 'Your letting was opened from the introduction record.',
    tenant_matched: 'You were matched to this property.',
    agreement_signed: 'You signed the agreement — terms are now fixed.',
    escrow_funded: 'Your rent and deposit were placed in escrow.',
    move_in_confirmed: 'You confirmed your move-in.',
    commission_earned: 'Our commission was recorded.',
    settled: 'The landlord was paid from escrow.',
    closed: 'Your tenancy is complete.',
    cancelled: 'The letting was cancelled.',
    refunded: 'Your money was refunded in full.',
    disputed: 'The letting was put on hold.',
  };
  const landlord: Record<string, string> = {
    created: 'A letting was opened for this property.',
    tenant_matched: 'A tenant was matched to this property.',
    agreement_signed: 'The listing agreement was signed.',
    escrow_funded: 'The tenant’s rent and deposit were placed in escrow.',
    move_in_confirmed: 'The tenant confirmed their move-in.',
    commission_earned: 'Our commission was recorded.',
    settled: 'You were paid from escrow.',
    closed: 'The tenancy is complete.',
    cancelled: 'The letting was cancelled.',
    refunded: 'The tenant was refunded in full.',
    disputed: 'The letting was put on hold.',
  };
  return (side === 'tenant' ? tenant : landlord)[toStatus] ?? toStatus.replace(/_/g, ' ');
}

/**
 * Viewing sentences, per side. The landlord's feed is NOT the tenant's
 * feed re-rendered — "You asked for a viewing" addressed to a landlord
 * was wrong, and D-1 says status→copy decisions live here, one place.
 */
function viewingEventLine(status: string, side: 'tenant' | 'landlord'): string {
  const tenant: Record<string, string> = {
    requested: 'You asked for a viewing. Our operations desk will confirm a time.',
    scheduled: 'A field officer was assigned and a time confirmed.',
    conducted: 'The visit happened. The introduction to the landlord is on record.',
    no_show: 'The officer could not reach you at the scheduled time.',
    cancelled: 'You cancelled this viewing.',
  };
  const landlord: Record<string, string> = {
    requested: 'A prospective tenant asked for a viewing of this home.',
    scheduled: 'A field officer was assigned; the visit has a confirmed time.',
    conducted: 'The visit happened. The introduction record is on file.',
    no_show: 'The tenant did not attend the scheduled visit.',
    cancelled: 'This viewing was cancelled before the visit.',
  };
  return (side === 'tenant' ? tenant : landlord)[status] ?? 'This viewing is closed.';
}

const LIMIT = 8;

/**
 * The most recent real events for one party, newest first, across both
 * halves of their journey: viewings and lettings. A landlord's rows come
 * from deals on their listings and viewings on their listings.
 */
export async function recentActivity(
  partyId: string,
  side: 'tenant' | 'landlord',
): Promise<ActivityRow[]> {
  const dealWhere =
    side === 'tenant'
      ? { tenantPartyId: partyId }
      : { landlordPartyId: partyId };
  const viewingWhere =
    side === 'tenant'
      ? { tenantPartyId: partyId }
      : { listing: { property: { ownerPartyId: partyId } } };

  const [transitions, viewings] = await Promise.all([
    db.dealTransition.findMany({
      where: { deal: dealWhere },
      orderBy: { createdAt: 'desc' },
      take: LIMIT,
      include: {
        deal: {
          include: {
            listing: { include: { property: { include: { neighbourhood: true } } } },
          },
        },
      },
    }),
    db.viewing.findMany({
      where: viewingWhere,
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
      include: {
        listing: { include: { property: { include: { neighbourhood: true } } } },
      },
    }),
  ]);

  const dealRows: ActivityRow[] = transitions.map((t) => {
    const l = t.deal.listing;
    const sideKey = side === 'tenant' ? 'tenant' : 'landlord';
    return {
      id: t.id,
      kind: 'deal' as const,
      title: `${l.property.bedrooms}-bed ${l.property.propertyType} in ${l.property.neighbourhood.name}`,
      line: dealEventLine(t.toStatus, sideKey),
      at: t.createdAt.toISOString(),
      statusLabel: dealLabel(t.toStatus),
      tone: dealTone(t.toStatus),
      href: side === 'tenant' ? `/account/deals/${t.dealId}` : `/landlord/deals/${t.dealId}`,
    };
  });

  const viewingRows: ActivityRow[] = viewings.map((v) => {
    const l = v.listing;
    // A landlord follows the letting, a tenant follows their own file —
    // same record, different place to land.
    const href = side === 'tenant' ? '/account/viewings' : '/landlord';
    return {
      id: `viewing-${v.id}`,
      kind: 'viewing' as const,
      title: `${l.property.bedrooms}-bed ${l.property.propertyType} in ${l.property.neighbourhood.name}`,
      line: viewingEventLine(v.status, side),
      at: (v.scheduledFor ?? v.updatedAt).toISOString(),
      statusLabel: viewingLabel(v.status),
      tone: viewingTone(v.status),
      href,
    };
  });

  return [...dealRows, ...viewingRows]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, LIMIT);
}
