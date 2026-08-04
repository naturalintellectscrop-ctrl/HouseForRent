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
  Pill,
  Price,
  PropertyImage,
  Row,
  Screen,
  Subtitle,
  Title,
  TrustNote,
  useCardSurface,
  VerifiedBadge,
} from '@/components/ui';
import {
  BathIcon,
  BedIcon,
  ClockIcon,
  HomeIcon,
  ShieldIcon,
  VerifiedIcon,
} from '@/components/icons';
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

          {/* ── FR-4.3 ── */}
          <Heading>What our officer confirmed</Heading>
          {data.fieldConfirmed ? (
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  gap: space.md,
                  marginBottom: space.sm,
                }}
              >
                <VerifiedIcon size={22} />
                <BodySm style={{ flex: 1 }}>
                  One of our field officers visited this property and filed the
                  report below. You are seeing what they recorded, not what the
                  landlord wrote.
                </BodySm>
              </View>
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
              <Divider />
              <Row
                label="Visited"
                value={new Date(
                  data.fieldConfirmed.reportedAt,
                ).toLocaleDateString()}
              />
            </Card>
          ) : (
            // Never a fabricated placeholder — an unvisited home must not
            // look inspected (FR-4.3).
            <Card>
              <BodySm>
                No officer report is on file for this home yet. It cannot be
                shown as verified until one is.
              </BodySm>
            </Card>
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

          <View style={{ marginTop: space.md }}>
            <TrustNote
              title="Safe Rent Guarantee"
              icon={<ShieldIcon size={20} color={p.brand} />}
            >
              Your upfront payment is held in escrow by a licensed payment
              provider — never by us — and released only once you confirm you
              have moved in. House For Rent charges tenants nothing; the
              landlord pays our commission.
            </TrustNote>
          </View>

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
        <Button
          label={caller ? 'Request a viewing' : 'Sign in to request a viewing'}
          onPress={requestViewing}
          busy={requesting}
        />
        <BodySm
          tone="faint"
          style={{ textAlign: 'center', marginTop: space.sm }}
        >
          A House For Rent officer meets you at the property — not the
          landlord, and not a broker.
        </BodySm>
      </View>
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
