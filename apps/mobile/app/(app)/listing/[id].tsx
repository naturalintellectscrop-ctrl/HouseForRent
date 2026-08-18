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
  Attribute,
  Body,
  BodySm,
  Button,
  Card,
  Divider,
  Heading,
  Loading,
  Price,
  PropertyImage,
  Row,
  Screen,
  Title,
  TrustList,
  useCardSurface,
  VerificationPanel,
  VerifiedBadge,
} from '@/components/ui';
import {
  BathIcon,
  BedIcon,
  ClockIcon,
  HomeIcon,
  LockIcon,
  ShieldIcon,
  SupportIcon,
} from '@/components/icons';
import { ScheduleViewingSheet } from '@/components/schedule-viewing';
import { radius, space, usePalette } from '@/lib/theme';

interface ListingDetail extends SearchResult {
  depositAmount: string;
  requiredMonthsUpfront: number;
  descriptionText: string | null;
  furnished: string;
  fieldConfirmed: FieldConfirmed | null;
}

const CONDITION_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

/**
 * One property.
 *
 * ── The reference's structure, kept ──
 * A full-bleed photograph, then a card that overlaps its lower edge
 * carrying location and price, then attributes, description, the officer's
 * report, the money, and a pinned action. The overlap is the one piece of
 * visual flourish in the design and it earns its place: it binds the
 * photograph to the facts about it, so the page reads as one object rather
 * than an image with a list underneath.
 *
 * ── What the officer confirmed is projected, never written ──
 * FR-4.3: the panel below is built from the STRUCTURED field report. There
 * is no free-text path into it, and an unvisited home renders the absence
 * plainly rather than an empty template that looks inspected.
 */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const p = usePalette();
  const surface = useCardSurface();
  const { caller, authed } = useSession();
  const router = useRouter();

  const { data, error, loading, refreshing, refresh } =
    usePublicRequest<ListingDetail>(`/v1/listings/${id}`, [id]);

  const [requesting, setRequesting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [outcome, setOutcome] = useState<
    { tone: 'ok' | 'error'; message: string; code?: string } | null
  >(null);

  async function requestViewing(when: Date) {
    setRequesting(true);
    setOutcome(null);
    try {
      // The tenant's proposed slot. Dispatch confirms or moves it when an
      // officer is assigned — the server owns scheduling, this only starts
      // the conversation (FR-5.1, FR-5.2).
      await authed('/v1/viewings', {
        method: 'POST',
        body: { listingId: id, scheduledFor: when.toISOString() },
      });
      setSheetOpen(false);
      setOutcome({
        tone: 'ok',
        message:
          'Viewing requested. We will confirm the time, and one of our officers will meet you there.',
      });
    } catch (err) {
      if (err instanceof OfflineError) {
        setOutcome({ tone: 'error', message: err.message });
      } else if (err instanceof ApiError) {
        setOutcome({
          tone: 'error',
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
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        // Room for the pinned action bar to sit over. Without it the last
        // section of the page can never be scrolled out from under the
        // button — the attribute row was permanently half-hidden behind it.
        contentContainerStyle={{ paddingBottom: 160 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={p.brand}
          />
        }
      >
        {/* Full-bleed, square-cornered: the photograph runs to the screen
            edge, so the rounded card below it is what reads as "on top". */}
        <PropertyImage uri={null} aspectRatio={4 / 3} radius={0}>
          {data.isVerified && (
            <View
              style={{
                position: 'absolute',
                top: space.gutter,
                left: space.gutter,
              }}
            >
              <VerifiedBadge label="Verified by our team" />
            </View>
          )}
        </PropertyImage>

        <View style={{ paddingHorizontal: space.screen }}>
          {/* Overlapping the image by 24px. */}
          <View
            style={[surface, { padding: space.gutter, marginTop: -space.lg }]}
          >
            <Freshness
              daysSinceConfirmed={data.daysSinceConfirmed}
              isStale={data.isStale}
            />
            <View style={{ marginTop: space.sm }}>
              <Title>{data.neighbourhoodName}</Title>
              {data.landmarkText ? (
                <BodySm>{data.landmarkText}</BodySm>
              ) : null}
            </View>

            <View style={{ marginVertical: space.md }}>
              <Divider />
            </View>

            <Price
              amount={formatShillings(data.monthlyRent)}
              per="/ month"
              size="lg"
            />
          </View>

          {/* Attributes, as the reference's three-up row. */}
          <View
            style={{
              flexDirection: 'row',
              backgroundColor: p.surfaceAlt,
              borderRadius: radius.control,
              paddingVertical: space.gutter,
              marginTop: space.gutter,
            }}
          >
            <Attribute
              icon={<BedIcon size={22} color={p.ink} />}
              label={`${data.bedrooms} BED`}
            />
            <Attribute
              icon={<BathIcon size={22} color={p.ink} />}
              label={`${data.bathrooms} BATH`}
            />
            <Attribute
              icon={<HomeIcon size={22} color={p.ink} />}
              label={data.furnished.replace(/_/g, ' ').toUpperCase()}
            />
          </View>

          {data.descriptionText ? (
            <>
              <Heading>About this property</Heading>
              <Body tone="muted">{data.descriptionText}</Body>
            </>
          ) : null}

          {/* ── FR-4.3 ──
              Verification leads with WHO checked and WHEN, then the report
              itself. The panel is the claim; the rows beneath are the
              evidence, and both come from the officer's structured record. */}
          <View style={{ marginTop: space.lg }}>
            <VerificationPanel
              inspectedAt={data.fieldConfirmed?.reportedAt ?? null}
            />
          </View>

          {data.fieldConfirmed && (
            <>
              <Heading>What the officer recorded</Heading>
              <Card>
                <BodySm style={{ marginBottom: space.md }}>
                  You are seeing what the officer wrote down on site, not what
                  the landlord submitted.
                </BodySm>
                <Divider />
                <Row
                  label="Condition"
                  value={
                    CONDITION_LABEL[data.fieldConfirmed.conditionRating] ??
                    data.fieldConfirmed.conditionRating
                  }
                />
                <Divider />
                <Row
                  label="Matches the listing"
                  value={data.fieldConfirmed.matchesListing ? 'Yes' : 'No'}
                />
                <Divider />
                <Row
                  label="Available"
                  value={data.fieldConfirmed.isAvailable ? 'Yes' : 'No'}
                />
              </Card>
            </>
          )}

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
          </Card>

          {/* Every row is a rule the system enforces, not a promise made
              here: the publish gate, the deal state machine's lack of any
              path that releases escrow before `move_in_confirmed`, and the
              landlord-paid commission (FR-9.2). */}
          <Heading>Why choose House For Rent?</Heading>
          <TrustList
            items={[
              {
                icon: <ShieldIcon size={18} color={p.brand} />,
                title: 'Verified properties',
                detail:
                  'Every home is physically inspected by one of our officers before it can be listed.',
              },
              {
                icon: <LockIcon size={18} color={p.brand} />,
                title: 'Trusted transactions',
                detail:
                  'Your upfront payment is held in escrow by a licensed provider — never by us — and released only once you confirm you have moved in.',
              },
              {
                icon: <SupportIcon size={18} color={p.brand} />,
                title: 'Free for tenants',
                detail:
                  'No search fee, no viewing fee, no fee to move in. The landlord pays our commission, and only after a completed let.',
              },
            ]}
          />

          {outcome && (
            <View style={{ marginTop: space.gutter }}>
              <Alert
                tone={outcome.tone}
                message={outcome.message}
                code={outcome.code}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pinned, as in the reference: on a long page the action should not
          require scrolling back to find it. */}
      <View
        style={{
          paddingHorizontal: space.screen,
          paddingTop: space.md,
          paddingBottom: space.lg,
          backgroundColor: p.surface,
          borderTopWidth: 1,
          borderTopColor: p.line,
        }}
      >
        {/* §8: the label says what happens. Signed out it says the step
            that comes first, rather than opening a sheet the tenant cannot
            submit from. */}
        <Button
          label={caller ? 'Schedule viewing' : 'Sign in to schedule a viewing'}
          onPress={() =>
            caller ? setSheetOpen(true) : router.push('/(auth)/welcome')
          }
        />
        <BodySm
          tone="faint"
          style={{ textAlign: 'center', marginTop: space.sm }}
        >
          A House For Rent officer meets you at the property — not the
          landlord, and not a broker.
        </BodySm>
      </View>

      <ScheduleViewingSheet
        visible={sheetOpen}
        busy={requesting}
        error={
          outcome?.tone === 'error'
            ? { message: outcome.message, code: outcome.code }
            : null
        }
        onClose={() => setSheetOpen(false)}
        onSubmit={requestViewing}
      />
    </View>
  );
}

function Freshness({
  daysSinceConfirmed,
  isStale,
}: {
  daysSinceConfirmed: number | null;
  isStale: boolean;
}) {
  const p = usePalette();
  const stale = isStale || daysSinceConfirmed === null;
  const colour = stale ? p.warn : p.inkSoft;
  const text =
    daysSinceConfirmed === null
      ? 'Availability not yet confirmed'
      : daysSinceConfirmed === 0
        ? 'Available — confirmed today'
        : `Available — confirmed ${daysSinceConfirmed} ${
            daysSinceConfirmed === 1 ? 'day' : 'days'
          } ago`;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <ClockIcon size={14} color={colour} />
      <BodySm style={{ color: colour }}>{text}</BodySm>
    </View>
  );
}
