import { View } from 'react-native';
import type { SearchResult } from '@/lib/api';
import { formatShillingsCompact } from '@/lib/money';
import {
  Body,
  BodySm,
  Card,
  Price,
  PropertyImage,
  Skeleton,
  VerifiedBadge,
} from '@/components/ui';
import { ClockIcon } from '@/components/icons';
import { space, usePalette } from '@/lib/theme';

/**
 * The property card — the reference's core component, and the one the whole
 * feed is judged on.
 *
 * ── Why the image leads ──
 * The reference puts a 4:3 photograph at full card width with the metadata
 * beneath it, rather than the 88px thumbnail this app used to show beside
 * two lines of text. That is the right call for a product whose promise is
 * that someone went and looked: a photograph the size of a stamp cannot
 * carry that, and a listing is a place before it is a row of numbers.
 *
 * ── The three signals, in the reference's order ──
 * Verified badge on the image, then location, then price, then freshness.
 * All three are trust signals FR-4.2 requires as first-class UI, and each
 * one comes from the server: `isVerified`, `daysSinceConfirmed`, `isStale`.
 * Nothing here is computed locally, so the card cannot disagree with the
 * feed that produced it.
 */
export function PropertyCard({
  item,
  onPress,
}: {
  item: SearchResult;
  onPress: () => void;
}) {
  const p = usePalette();

  return (
    <Card onPress={onPress} padded={false} style={{ overflow: 'hidden' }}>
      <PropertyImage uri={null} aspectRatio={4 / 3} radius={0}>
        {item.isVerified && (
          <View style={{ position: 'absolute', top: space.md, left: space.md }}>
            <VerifiedBadge />
          </View>
        )}
      </PropertyImage>

      <View style={{ padding: space.gutter, gap: space.xs }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: space.md,
          }}
        >
          <Body style={{ flex: 1 }} numberOfLines={1}>
            {item.neighbourhoodName}
            {item.landmarkText ? `, ${item.landmarkText}` : ''}
          </Body>
          <Price amount={formatShillingsCompact(item.monthlyRent)} />
        </View>

        <BodySm>
          {item.bedrooms} Bed · {item.bathrooms} Bath ·{' '}
          {capitalise(item.propertyType)}
        </BodySm>

        <Freshness
          daysSinceConfirmed={item.daysSinceConfirmed}
          isStale={item.isStale}
        />
      </View>
    </Card>
  );
}

/**
 * The availability line, in the server's own terms.
 *
 * This is the signal that separates this product from a listings board: a
 * home is not just verified once, it was confirmed available on a date, and
 * that date decays. `isStale` is the server's judgement against the
 * configured freshness window — never recomputed here, because a client
 * that decided for itself would eventually disagree, and it would be the
 * one that was wrong.
 */
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
      <BodySm tone={stale ? 'default' : 'muted'} style={{ color: colour }}>
        {text}
      </BodySm>
    </View>
  );
}

/** The card as it looks while the feed is still arriving. */
export function PropertyCardSkeleton() {
  return (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <Skeleton aspectRatio={4 / 3} radius={0} />
      <View style={{ padding: space.gutter, gap: space.sm }}>
        <Skeleton height={16} width="70%" radius={4} />
        <Skeleton height={14} width="45%" radius={4} />
      </View>
    </Card>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
