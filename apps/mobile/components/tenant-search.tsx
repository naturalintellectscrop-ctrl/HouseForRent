import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePublicRequest } from '@/lib/use-request';
import type { SearchResponse } from '@/lib/api';
import {
  Alert,
  Button,
  ChipRow,
  Empty,
  Title,
  TrustNote,
  useTopInset,
} from '@/components/ui';
import { PropertyCard, PropertyCardSkeleton } from '@/components/property-card';
import {
  countActive,
  FiltersSheet,
  NO_FILTERS,
  type Filters,
} from '@/components/filters-sheet';
import { FilterIcon, ShieldIcon } from '@/components/icons';
import { radius, space, usePalette } from '@/lib/theme';

/**
 * FR-4.1 / FR-4.2 — the public feed.
 *
 * ── Nothing here decides what is shown ──
 * The server applies `live + verified + in-corridor` regardless of filters,
 * excludes stale listings by default, and orders freshest-first. This
 * screen sends filters and renders the answer; it cannot widen the feed
 * past those three constraints.
 *
 * ── The chips filter by PROPERTY TYPE, not by "Villa" ──
 * They mirror the `PropertyType` enum the schema actually has, because a
 * filter for a category the data cannot express would return nothing and
 * look broken.
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
  const topInset = useTopInset();
  const router = useRouter();
  const [type, setType] = useState<TypeFilter>('all');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.minRent) params.set('minRent', filters.minRent);
    if (filters.maxRent) params.set('maxRent', filters.maxRent);
    if (filters.bedrooms !== null) {
      params.set('bedrooms', String(filters.bedrooms));
    }
    const qs = params.toString();
    return `/v1/listings${qs ? `?${qs}` : ''}`;
  }, [filters]);

  const { data, error, loading, refreshing, refresh } =
    usePublicRequest<SearchResponse>(query, [query]);

  const results = (data?.results ?? []).filter(
    (r) => type === 'all' || r.propertyType === type,
  );
  const activeCount = countActive(filters);

  return (
    <>
      <FlatList
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={{
          paddingHorizontal: space.screen,
          paddingBottom: space.section,
        }}
        data={results}
        keyExtractor={(item) => item.listingId}
        // The reference's cards sit on a generous 32px rhythm. A feed of
        // photographs needs the air; packed tighter they read as a filmstrip.
        ItemSeparatorComponent={() => <View style={{ height: space.xl }} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={p.brand}
          />
        }
        ListHeaderComponent={
          <View style={{ paddingTop: topInset + space.md }}>
            {/* The filter control sits beside the TITLE, not beside the
                chips. Next to the chips it cropped the scrolling row at a
                hard vertical edge mid-word, which reads as a broken layout
                rather than as content that continues. Up here the row gets
                the full width and can run off the screen edge, where a
                clipped chip is obviously more-to-scroll. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: space.md,
              }}
            >
              <Title>Find a home</Title>
              <FilterButton
                count={activeCount}
                onPress={() => setSheetOpen(true)}
              />
            </View>

            <View style={{ marginTop: space.md, marginBottom: space.gutter }}>
              <ChipRow options={TYPE_CHIPS} value={type} onChange={setType} />
            </View>

            {/* FR-9.2 — the tenant-facing surface states this structurally,
                and the server asserts `freeForTenants` on every result. */}
            <View style={{ marginBottom: space.lg }}>
              <TrustNote icon={<ShieldIcon size={20} color={p.brand} />}>
                Every home here was visited by one of our officers. Searching,
                viewing and moving in are free for tenants.
              </TrustNote>
            </View>

            {error && (
              <Alert tone="error" message={error.message} code={error.code} />
            )}

            {/* Card-shaped placeholders, not a spinner: they say what is
                arriving and hold the layout still when it does. */}
            {loading && (
              <View style={{ gap: space.xl }}>
                <PropertyCardSkeleton />
                <PropertyCardSkeleton />
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading || error ? null : (
            <EmptyFeed
              type={type}
              typeLabel={
                TYPE_CHIPS.find((c) => c.value === type)?.label.toLowerCase() ??
                ''
              }
              unfilteredCount={data?.results.length ?? 0}
              activeCount={activeCount}
              serverMessage={data?.emptyStateMessage ?? null}
              onShowAllTypes={() => setType('all')}
              onClearFilters={() => setFilters(NO_FILTERS)}
            />
          )
        }
        renderItem={({ item }) => (
          <PropertyCard
            item={item}
            onPress={() => router.push(`/(app)/listing/${item.listingId}`)}
          />
        )}
      />

      <FiltersSheet
        visible={sheetOpen}
        initial={filters}
        onClose={() => setSheetOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setSheetOpen(false);
        }}
      />
    </>
  );
}

function FilterButton({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `Filters, ${count} applied` : 'Filters'
      }
      onPress={onPress}
      style={({ pressed }) => ({
        width: 48,
        height: 48,
        borderRadius: radius.control,
        borderWidth: 1,
        borderColor: count > 0 ? p.brand : p.line,
        backgroundColor: count > 0 ? p.brandSoft : p.surface,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <FilterIcon size={22} color={count > 0 ? p.brand : p.ink} />
    </Pressable>
  );
}

/**
 * The empty feed, in three distinct cases.
 *
 * They are genuinely different situations and collapsing them into one
 * message would mislead in two of the three: a filter that excluded
 * everything is the user's own doing and is undone with a tap, whereas a
 * corridor that has nothing verified yet is the platform's state and no
 * amount of tapping fixes it. FR-4.4 requires the last of those to read as
 * ongoing verification rather than as failure, and that copy is the
 * server's, not ours.
 */
function EmptyFeed({
  type,
  typeLabel,
  unfilteredCount,
  activeCount,
  serverMessage,
  onShowAllTypes,
  onClearFilters,
}: {
  type: TypeFilter;
  typeLabel: string;
  unfilteredCount: number;
  activeCount: number;
  serverMessage: string | null;
  onShowAllTypes: () => void;
  onClearFilters: () => void;
}) {
  if (type !== 'all' && unfilteredCount > 0) {
    return (
      <Empty
        title={`No ${typeLabel} in these results`}
        message="Other property types matched what you asked for."
        action={
          <Button label="Show all types" variant="outline" onPress={onShowAllTypes} />
        }
      />
    );
  }

  if (activeCount > 0) {
    return (
      <Empty
        title="No verified homes match these filters"
        message="Our officers add homes as they finish inspecting them, so a narrow search in the corridor can come back empty on any given day. Widening the budget usually turns something up."
        action={
          <Button label="Clear filters" variant="outline" onPress={onClearFilters} />
        }
      />
    );
  }

  return (
    <Empty
      title="No verified homes here yet"
      message={
        serverMessage ??
        'More homes are being verified in the corridor. Check back shortly.'
      }
    />
  );
}
