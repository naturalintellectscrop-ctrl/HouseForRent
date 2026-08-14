import type { DealStatus } from '@/lib/api';
import { Pill, type PillTone } from '@/components/ui';

/**
 * How each deal state reads to a tenant and to a landlord.
 *
 * ── This is vocabulary, not logic ──
 * Nothing here decides what may happen next; it only names the state the
 * server reported. The transition graph lives in the backend
 * (`deal-state-machine.ts`) and is the only thing that decides anything.
 *
 * The two audiences genuinely need different words for the same state:
 * `escrow_funded` is "your money is protected" to a tenant and "the tenant
 * has paid" to a landlord, and flattening both into one neutral phrase
 * would serve neither.
 */
interface StateCopy {
  label: string;
  tone: PillTone;
  tenant: string;
  lister: string;
}

const STATES: Record<DealStatus, StateCopy> = {
  created: {
    label: 'starting',
    tone: 'neutral',
    tenant: 'This rental has been opened. Nothing is owed yet.',
    lister: 'A rental has been opened for this listing.',
  },
  tenant_matched: {
    label: 'matched',
    tone: 'neutral',
    tenant:
      'You have been matched to this home after your viewing. The landlord will send the agreement next.',
    lister:
      'A tenant introduced by our officer has been matched. Sign the agreement to continue.',
  },
  agreement_signed: {
    label: 'awaiting payment',
    tone: 'warn',
    tenant:
      'The agreement is signed. Pay the upfront amount into escrow — we hold it until you confirm you have moved in.',
    lister:
      'Agreement signed. The commission rate and monthly rent are now fixed for this let and cannot change.',
  },
  escrow_funded: {
    label: 'money protected',
    tone: 'ok',
    tenant:
      'Your money is held in escrow. It is not released to the landlord until you confirm you have moved in.',
    lister:
      'The tenant has paid into escrow. Funds are released after they confirm move-in.',
  },
  move_in_confirmed: {
    label: 'moved in',
    tone: 'ok',
    tenant:
      'You confirmed your move-in. Settlement to the landlord follows.',
    lister: 'The tenant confirmed move-in. Settlement is being prepared.',
  },
  commission_earned: {
    label: 'settling',
    tone: 'ok',
    tenant: 'Everything is complete on your side.',
    lister:
      'Commission has been recognised. Your payout, net of commission, is being released.',
  },
  settled: {
    label: 'settled',
    tone: 'ok',
    tenant: 'This rental is settled.',
    lister: 'Paid out, net of commission.',
  },
  closed: {
    label: 'closed',
    tone: 'neutral',
    tenant: 'This rental is closed.',
    lister: 'This let is closed.',
  },
  cancelled: {
    label: 'cancelled',
    tone: 'neutral',
    tenant: 'This rental was cancelled before any money was paid.',
    lister: 'Cancelled before funding.',
  },
  refunded: {
    label: 'refunded',
    tone: 'warn',
    tenant:
      'Your money was returned in full. The guarantee means you never lose a deposit to a home you could not move into.',
    lister: 'The tenant was refunded in full.',
  },
  dispute_hold: {
    label: 'on hold',
    tone: 'warn',
    tenant:
      'This rental is on hold while we resolve an issue. Your money stays protected.',
    lister: 'On hold while we resolve an issue.',
  },
};

export function DealStatePill({ status }: { status: DealStatus }) {
  const state = STATES[status];
  return <Pill tone={state?.tone ?? 'neutral'}>{state?.label ?? status}</Pill>;
}

export function explainState(
  status: DealStatus,
  audience: 'tenant' | 'lister',
): string {
  const state = STATES[status];
  if (!state) return '';
  return audience === 'lister' ? state.lister : state.tenant;
}
