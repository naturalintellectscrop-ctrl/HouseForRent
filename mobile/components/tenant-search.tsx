import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePublicRequest } from '@/lib/use-request';
import type { SearchResponse, SearchResult } from '@/lib/api';
import { formatShillingsCompact } from '@/lib/money';
import {
  Alert,
  Body,
  Card,
  ChipRow,
  Empty,
  Field,
  Loading,
  PhotoPlaceholder,
  Pill,
  Price,
  Title,
} from '@/components/ui';
import { space, usePalette } from '@/lib/theme';

/**
 * FR-4.1 / FR-4.2 — the public feed, in the reference's card layout: a
 * thumbnail on the left, title and location stacked, price in brand colour.
 *
 * ── Nothing here decides what is shown ──
 * The server applies `live + verified + in-corridor` regardless of filters,
 * excludes stale listings by default, and orders freshest-first. This
 * screen sends filters and renders the answer; it cannot widen the feed
 * past those three constraints.
 *
 * ── The chips filter by PROPERTY TYPE, not by "Villa" ──
 * The reference offers All / House / Villa / Apartments. Ours mirror the
 * `PropertyType` enum the schema actually has (apartment, house, room),
 * because a filter for a category the data cannot express would return
 * nothing and look broken.
 */
type TypeFilter = 'all' | 'apartment' | 'house' | 'room';

const TYPE_CHIPS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'apartment', label: 'Apartments' },
  { value: 'house', label: 'Houses' },
  { value: 'room', label: 'Rooms' },
];

export default function TenantSearch() {
  const p = usePalette();
  const router = useRouter();
  const [budget, setBudget] = useState('');
  const [type, setType] = useState<TypeFilter>('all');

  // Only digits reach the query: the server takes money as integer
  // shillings, and sending anything else is a wasted round trip on a
  // connection we are trying to spend carefully.
  const maxRent = budget.replace(/[^0-9]/g, '');
  const path = useMemo(
    () => `/v1/listings${maxRent ? `?maxRent=${maxRent}` : ''}`,
    [maxRent],
  );

  const { data, error, loading, refreshing, refresh } =
    usePublicRequest<SearchResponse>(path, [maxRent]);

  // Property type is not a server-side filter today, so it narrows the
  // returned page rather than the query. Kept explicit: this is the ONLY
  // client-side narrowing in the app, and it can only ever remove rows the
  // server already approved — it cannot reveal one it withheld.
  const results = (data?.results ?? []).filter(
    (r) => type === 'all' || r.propertyType === type,
  );

  return (
    <FlatList
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
      data={results}
      keyExtractor={(item) => item.listingId}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={p.brand}
        />
      }
      ListHeaderComponent={
        <View>
          <Title>Find a home</Title>
          <Body muted style={{ marginBottom: space.lg }}>
            Every home here was visited by one of our officers. Searching,
            viewing and moving in are free for tenants.
          </Body>

          <Field
            label="Monthly budget"
            glyph="⌕"
            value={budget}
            onChangeText={setBudget}
            placeholder="Any budget"
            keyboardType="number-pad"
            hint="Shillings per month. Leave blank to see everything."
          />

          <View style={{ marginBottom: space.lg }}>
            <ChipRow options={TYPE_CHIPS} value={type} onChange={setType} />
          </View>

          {error && (
            <Alert tone="error" message={error.message} code={error.code} />
          )}
          {loading && <Loading label="Loading homes…" />}
        </View>
      }
      ListEmptyComponent={
        loading || error ? null : (
          <Empty
            title="No homes match yet"
            glyph="⌂"
            // FR-4.4: the honest empty state is the SERVER's copy — it
            // explains ongoing verification rather than reading as failure.
            message={
              type !== 'all' && (data?.results.length ?? 0) > 0
                ? 'No homes of this type in the current results. Try “All”.'
                : (data?.emptyStateMessage ??
                  'More homes are being verified. Check back shortly.')
            }
          />
        )
      }
      renderItem={({ item }) => (
        <ListingCard
          item={item}
          onPress={() => router.push(`/(app)/listing/${item.listingId}`)}
        />
      )}
    />
  );
}

function ListingCard({
  item,
  onPress,
}: {
  item: SearchResult;
  onPress: () => void;
}) {
  const p = usePalette();

  return (
    <Card onPress={onPress} style={{ padding: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <PhotoPlaceholder size={88} />

        <View style={{ flex: 1, justifyContent: 'space-between' }}>
          <View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: space.sm,
              }}
            >
              <Body style={{ fontWeight: '800', flex: 1 }}>
                {item.bedrooms} bed {item.propertyType}
              </Body>
              {item.isVerified && <Pill tone="ok">verified</Pill>}
            </View>

            <Body muted style={{ marginTop: 2 }}>
              {item.neighbourhoodName} · {item.landmarkText}
            </Body>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: space.sm,
              gap: space.sm,
            }}
          >
            <Price
              amount={formatShillingsCompact(item.monthlyRent)}
              per="/month"
            />
            {/* Freshness in the server's own terms — never recomputed here. */}
            {item.daysSinceConfirmed === null ? (
              <Pill tone="warn">unconfirmed</Pill>
            ) : item.isStale ? (
              <Pill tone="warn">{item.daysSinceConfirmed}d ago</Pill>
            ) : (
              <Pill tone="brand">
                {item.daysSinceConfirmed === 0
                  ? 'confirmed today'
                  : `confirmed ${item.daysSinceConfirmed}d ago`}
              </Pill>
            )}
          </View>
        </View>
      </View>
    </Card>
  );
}
