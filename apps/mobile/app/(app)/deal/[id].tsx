import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthedRequest, describeError } from '@/lib/use-request';
import { useSession } from '@/lib/session';
import type { DealDetail } from '@/lib/api';
import { formatShillings, isValidAmount, parseShillings } from '@/lib/money';
import {
  Alert,
  BodySm,
  Button,
  Card,
  Divider,
  Field,
  Heading,
  Loading,
  Row,
  Screen,
  Title,
  TrustNote,
} from '@/components/ui';
import { DealStatePill, explainState } from '@/components/deal-status';
import { ShieldIcon } from '@/components/icons';
import { radius, space, usePalette } from '@/lib/theme';

/**
 * One rental, and the single action (if any) available to this party now.
 *
 * ── The client offers actions; it does not authorise them ──
 * Which button appears is chosen from the status the server reported, so
 * the UI matches the state machine. It is NOT the enforcement: pressing
 * anything the server disallows returns 409 ILLEGAL_TRANSITION, and the
 * transition graph in the backend has no edge for it regardless of what
 * this screen renders (Data_Model.md §7.3).
 *
 * ── Why the tenant confirms move-in ──
 * It releases the tenant's own money from protection, so the party at risk
 * is the one who says the condition is met. A landlord-confirmed move-in
 * would let the beneficiary unlock the escrow (API Spec §4.1).
 */
export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const router = useRouter();
  const { caller, authed } = useSession();

  const { data, error, loading, refreshing, refresh, reload } =
    useAuthedRequest<DealDetail>(`/v1/deals/${id}`, [id]);

  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<
    { tone: 'ok' | 'error'; message: string; code?: string } | null
  >(null);

  async function act(path: string, body?: Record<string, unknown>) {
    setBusy(true);
    setOutcome(null);
    try {
      await authed(`/v1/deals/${id}/${path}`, {
        method: 'POST',
        body: body ?? {},
      });
      reload();
      setOutcome({ tone: 'ok', message: 'Done.' });
    } catch (err) {
      setOutcome({ tone: 'error', ...describeError(err) });
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading rental…" />;
  if (error || !data) {
    return (
      <Screen>
        <Alert
          tone="error"
          message={error?.message ?? 'This rental could not be found.'}
          code={error?.code}
        />
        <Button label="Back" variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  const { deal, transitions } = data;
  const isTenant = deal.tenantPartyId === caller?.partyId;
  const audience = isTenant ? 'tenant' : 'lister';
  const protectedNow =
    deal.status === 'escrow_funded' || deal.status === 'dispute_hold';

  return (
    <ScrollView
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.screen, paddingBottom: space.section }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={p.brand}
        />
      }
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: space.md,
          marginBottom: space.sm,
        }}
      >
        <Title>{isTenant ? 'Your rental' : 'Your let'}</Title>
        <DealStatePill status={deal.status} />
      </View>

      <BodySm style={{ marginBottom: space.lg }}>
        {explainState(deal.status, audience)}
      </BodySm>

      {/* The guarantee, made visible while it is actually holding. */}
      {protectedNow && isTenant && (
        <View style={{ marginBottom: space.lg }}>
          <TrustNote
            title="Your money is protected"
            icon={<ShieldIcon size={20} color={p.brand} />}
          >
            Held in escrow by a licensed provider — never by us — until you
            confirm you have moved in.
          </TrustNote>
        </View>
      )}

      {outcome && (
        <Alert
          tone={outcome.tone}
          message={outcome.message}
          code={outcome.code}
        />
      )}

      <Heading>Terms</Heading>
      <Card>
        <Row
          label="Monthly rent"
          value={
            deal.monthlyRentSnapshot
              ? formatShillings(deal.monthlyRentSnapshot)
              : 'Fixed when the agreement is signed'
          }
        />
        {/* Landlords see the commission; tenants are charged nothing, so
            showing them a commission line would imply otherwise
            (Decision 3, FR-9.2). */}
        {!isTenant && (
          <>
            <Divider />
            <Row
              label="Our commission"
              value={
                deal.commissionAmount
                  ? formatShillings(deal.commissionAmount)
                  : deal.commissionRateBpSnapshot
                    ? `${deal.commissionRateBpSnapshot / 10000} month, only on a successful let`
                    : 'Fixed when you sign'
              }
            />
          </>
        )}
        {isTenant && (
          <>
            <Divider />
            <Row label="What we charge you" value="Nothing" strong />
          </>
        )}
      </Card>

      {/* ── The one action this party can take now ── */}
      {isTenant && deal.status === 'agreement_signed' && (
        <>
          <Heading>Pay into escrow</Heading>
          <BodySm style={{ marginBottom: space.md }}>
            We hold this until you confirm you have moved in. If you cannot
            move in, it comes back to you in full.
          </BodySm>
          <Field
            label="Amount in shillings"
            value={amount}
            onChangeText={setAmount}
            placeholder="e.g. 4000000"
            keyboardType="number-pad"
            hint="Whole shillings, as agreed with the landlord."
            editable={!busy}
          />
          <Button
            label={
              isValidAmount(amount)
                ? `Pay ${formatShillings(parseShillings(amount))}`
                : 'Pay into escrow'
            }
            onPress={() =>
              act('fund-escrow', { amount: amount.replace(/[^0-9]/g, '') })
            }
            busy={busy}
            disabled={!isValidAmount(amount)}
          />
        </>
      )}

      {isTenant && deal.status === 'escrow_funded' && (
        <>
          <Heading>Have you moved in?</Heading>
          <BodySm style={{ marginBottom: space.md }}>
            Only confirm once you are actually in the property. This is what
            releases your money to the landlord — until you do, it stays
            protected.
          </BodySm>
          <Button
            label="I have moved in"
            onPress={() => act('confirm-move-in')}
            busy={busy}
          />
        </>
      )}

      {!isTenant && deal.status === 'tenant_matched' && (
        <>
          <Heading>Sign the agreement</Heading>
          <BodySm style={{ marginBottom: space.md }}>
            Signing fixes the commission rate and the monthly rent for this
            let. Neither can change afterwards, whatever our standard rate
            does.
          </BodySm>
          <Alert
            tone="note"
            message="Signing is done from the agreement you accepted when listing. Contact us if the terms need to change before you sign."
          />
        </>
      )}

      <Heading>History</Heading>
      <Card>
        {transitions.length === 0 ? (
          <BodySm>No changes recorded yet.</BodySm>
        ) : (
          transitions.map((t, i) => (
            <View key={t.id}>
              {i > 0 && <Divider />}
              <Row
                label={new Date(t.occurredAt).toLocaleDateString()}
                value={t.toStatus.replace(/_/g, ' ')}
              />
            </View>
          ))
        )}
      </Card>

      {isTenant && (
        <Alert
          tone="note"
          message="The Move-In Guarantee: there is no way for us to release your money to a landlord before you confirm you have moved in. It is not a policy we apply — the system has no path that does it."
        />
      )}
    </ScrollView>
  );
}
