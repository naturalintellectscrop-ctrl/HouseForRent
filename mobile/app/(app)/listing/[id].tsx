import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePublicRequest } from '@/lib/use-request';
import { useSession } from '@/lib/session';
import {
  ApiError,
  OfflineError,
  type FieldConfirmed,
  type SearchResult,
} from '@/lib/api';
import { formatShillings, suggestedUpfront } from '@/lib/money';
import {
  Alert,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  Loading,
  PhotoPlaceholder,
  Pill,
  Price,
  Row,
  Screen,
  Title,
} from '@/components/ui';
import { radius, space, usePalette } from '@/lib/theme';

interface ListingDetail extends SearchResult {
  depositAmount: string;
  requiredMonthsUpfront: number;
  descriptionText: string | null;
  furnished: string;
  fieldConfirmed: FieldConfirmed | null;
}

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent condition',
  good: 'Good condition',
  fair: 'Fair condition',
  poor: 'Poor condition',
};

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const { caller, authed } = useSession();
  const router = useRouter();

  const { data, error, loading, refreshing, refresh } =
    usePublicRequest<ListingDetail>(`/v1/listings/${id}`, [id]);

  const [requesting, setRequesting] = useState(false);
  const [outcome, setOutcome] = useState<
    { tone: 'ok' | 'error'; message: string; code?: string } | null
  >(null);

  async function requestViewing() {
    if (!caller) {
      router.push('/(auth)/welcome');
      return;
    }
    setRequesting(true);
    setOutcome(null);
    try {
      // Tomorrow at 10:00 as the opening proposal. Dispatch confirms or
      // moves it when an officer is assigned — the server owns scheduling,
      // this only starts the conversation (FR-5.1, FR-5.2).
      const when = new Date();
      when.setDate(when.getDate() + 1);
      when.setHours(10, 0, 0, 0);

      await authed('/v1/viewings', {
        method: 'POST',
        body: { listingId: id, scheduledFor: when.toISOString() },
      });
      setOutcome({
        tone: 'ok',
        message:
          'Viewing requested. We will confirm a time, and one of our officers will meet you there.',
      });
    } catch (err) {
      if (err instanceof OfflineError) {
        setOutcome({ tone: 'error', message: err.message });
      } else if (err instanceof ApiError) {
        setOutcome({
          tone: 'error',
          // The server's own reason: TENANT_NOT_VERIFIED and
          // LISTING_NOT_VIEWABLE need different actions from the tenant.
          message:
            err.code === 'TENANT_NOT_VERIFIED'
              ? 'Finish verifying your identity before requesting a viewing. Our officer meets you at a stranger’s home, so we confirm who you are first.'
              : err.message,
          code: err.code,
        });
      } else {
        setOutcome({ tone: 'error', message: 'Could not request a viewing.' });
      }
    } finally {
      setRequesting(false);
    }
  }

  if (loading) return <Loading label="Loading home…" />;
  if (error || !data) {
    return (
      <Screen>
        <Alert
          tone="error"
          message={error?.message ?? 'This home is no longer available.'}
          code={error?.code}
        />
        <Button label="Back" variant="outline" onPress={() => router.back()} />
      </Screen>
    );
  }

  const upfront = suggestedUpfront(data);

  return (
    <ScrollView
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={p.brand}
        />
      }
    >
      {/* Hero. Real photography arrives when the media provider is swapped
          from the V1 mock; until then this is honest about being absent. */}
      <View
        style={{
          height: 190,
          borderRadius: radius.md,
          backgroundColor: p.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.lg,
        }}
      >
        <PhotoPlaceholder size={80} radius={radius.md} />
        <Body faint style={{ marginTop: space.sm }}>
          Officer photos coming soon
        </Body>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: space.md,
        }}
      >
        <View style={{ flex: 1 }}>
          <Title>
            {data.bedrooms} bed {data.propertyType}
          </Title>
          <Body muted>
            {data.neighbourhoodName} · {data.landmarkText}
          </Body>
        </View>
        {data.isVerified && <Pill tone="ok">verified</Pill>}
      </View>

      <View style={{ marginTop: space.md, marginBottom: space.lg }}>
        <Price
          amount={formatShillings(data.monthlyRent)}
          per="/month"
          size="lg"
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: space.sm,
          flexWrap: 'wrap',
          marginBottom: space.lg,
        }}
      >
        <Pill tone="brand">free for tenants</Pill>
        <Pill>{data.furnished.replace(/_/g, ' ')}</Pill>
        <Pill>
          {data.bathrooms} bath{data.bathrooms === 1 ? '' : 's'}
        </Pill>
        {data.isStale && <Pill tone="warn">availability not recent</Pill>}
      </View>

      {data.descriptionText ? (
        <Card>
          <Body>{data.descriptionText}</Body>
        </Card>
      ) : null}

      {/* FR-4.3 — projected from the STRUCTURED field report, never free text. */}
      <Heading>What our officer confirmed</Heading>
      <Card>
        {data.fieldConfirmed ? (
          <>
            <Row
              label="Condition"
              value={
                CONDITION_LABEL[data.fieldConfirmed.conditionRating] ??
                data.fieldConfirmed.conditionRating
              }
            />
            <Divider />
            <Row
              label="Matches listing"
              value={data.fieldConfirmed.matchesListing ? 'Yes' : 'No'}
            />
            <Divider />
            <Row
              label="Available"
              value={data.fieldConfirmed.isAvailable ? 'Yes' : 'No'}
            />
            <Divider />
            <Row
              label="Visited"
              value={new Date(
                data.fieldConfirmed.reportedAt,
              ).toLocaleDateString()}
            />
          </>
        ) : (
          // Never a fabricated placeholder — an unvisited home must not
          // look inspected (FR-4.3).
          <Body muted>No officer report on file for this home yet.</Body>
        )}
      </Card>

      <Heading>What you would pay</Heading>
      <Card>
        <Row label="Monthly rent" value={formatShillings(data.monthlyRent)} />
        <Divider />
        <Row label="Deposit" value={formatShillings(data.depositAmount)} />
        <Divider />
        <Row
          label="Months upfront"
          value={String(data.requiredMonthsUpfront)}
        />
        <Divider />
        <Row label="Total upfront" value={formatShillings(upfront)} strong />
        <Body muted style={{ marginTop: space.md }}>
          Paid into escrow and held until you confirm you have moved in.
          House For Rent charges you nothing — the landlord pays our
          commission.
        </Body>
      </Card>

      {outcome && (
        <Alert
          tone={outcome.tone}
          message={outcome.message}
          code={outcome.code}
        />
      )}

      <Heading>See it in person</Heading>
      <Body muted style={{ marginBottom: space.md }}>
        A House For Rent field officer will meet you at the property — not
        the landlord, and not a broker.
      </Body>
      <Button
        label={caller ? 'Request a viewing' : 'Sign in to request a viewing'}
        onPress={requestViewing}
        busy={requesting}
      />
    </ScrollView>
  );
}
