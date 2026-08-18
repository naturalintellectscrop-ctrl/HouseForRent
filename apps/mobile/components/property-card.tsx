import { View } from 'react-native';
import type { SearchResult } from '@/lib/api';
import { formatShillingsCompact } from '@/lib/money';
import {
  BodySm,
  Card,
  Label,
  Price,
  PropertyImage,
  Skeleton,
  VerifiedBadge,
} from '@/components/ui';
import { BathIcon, BedIcon, ClockIcon, PinIcon } from '@/components/icons';
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

      {/* §12's order: what it is, where it is, what it costs, then
          how current the availability is. The title is composed from real
          fields — bedrooms and propertyType — because listings carry no
          name of their own, and inventing one ('Modern 4 Bedroom House')
          would be writing copy into a data slot. */}
      <View style={{ padding: space.gutter, gap: space.xs }}>
        <Label numberOfLines={1}>
          {item.bedrooms} Bedroom {capitalise(item.propertyType)}
        </Label>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <PinIcon size={14} color={p.inkFaint} />
          <BodySm numberOfLines={1} style={{ flex: 1 }}>
            {item.neighbourhoodName}
            {item.landmarkText ? `, ${item.landmarkText}` : ''}
          </BodySm>
        </View>

        <View style={{ marginTop: space.xs }}>
          <Price amount={formatShillingsCompact(item.monthlyRent)} per="/ month" />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.gutter,
            marginTop: space.sm,
            paddingTop: space.sm,
            borderTopWidth: 1,
            borderTopColor: p.line,
          }}
        >
          <Feature
            icon={<BedIcon size={16} color={p.inkSoft} />}
            label={`${item.bedrooms} Beds`}
          />
          <Feature
            icon={<BathIcon size={16} color={p.inkSoft} />}
            label={`${item.bathrooms} Baths`}
          />
        </View>

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

/**
 * One attribute on a listing card.
 *
 * The icon earns its place here: these sit in a tight row where the label is
 * two words, and the glyph is what makes the row scannable at a glance
 * rather than read left to right.
 */
function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon}
      <BodySm>{label}</BodySm>
    </View>
  );
}
