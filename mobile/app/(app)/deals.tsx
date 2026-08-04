import { FlatList, View } from 'react-native';
import { RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthedRequest } from '@/lib/use-request';
import { useSession } from '@/lib/session';
import type { Deal, Viewing } from '@/lib/api';
import { formatShillingsCompact } from '@/lib/money';
import {
  Alert,
  Body,
  BodySm,
  Button,
  Card,
  Divider,
  Empty,
  Heading,
  Loading,
  Pill,
  Price,
  Title,
  useTopInset,
} from '@/components/ui';
import { CalendarIcon, ChevronRightIcon } from '@/components/icons';
import { DealStatePill } from '@/components/deal-status';
import { space, usePalette } from '@/lib/theme';

const VIEWING_TONE = {
  requested: 'warn',
  scheduled: 'brand',
  conducted: 'ok',
  no_show: 'danger',
  cancelled: 'neutral',
} as const;

const VIEWING_LABEL = {
  requested: 'awaiting a time',
  scheduled: 'scheduled',
  conducted: 'viewed',
  no_show: 'missed',
  cancelled: 'cancelled',
} as const;

const VIEWING_EXPLAIN = {
  requested: 'We are assigning an officer and will confirm the time.',
  scheduled: 'An officer will meet you at the property.',
  conducted: 'Viewed with our officer.',
  no_show: 'Recorded as a missed viewing.',
  cancelled: 'This viewing was cancelled.',
} as const;

/**
 * The caller's rentals — plus, for a tenant, the viewings that precede them.
 *
 * Both lists are scoped by the SERVER from the session (`GET /v1/deals`,
 * `GET /v1/viewings/mine`). This screen sends no identifier of its own,
 * which is what makes it impossible for it to ask for someone else's.
 */
export default function Deals() {
  const p = usePalette();
  const topInset = useTopInset();
  const router = useRouter();
  const { role } = useSession();
  const isLister = role === 'lister';

  const deals = useAuthedRequest<Deal[]>('/v1/deals');
  const viewings = useAuthedRequest<Viewing[]>(
    isLister ? null : '/v1/viewings/mine',
  );

  const refreshing = deals.refreshing || viewings.refreshing;

  return (
    <FlatList
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={{
        paddingHorizontal: space.screen,
        paddingBottom: space.section,
      }}
      data={deals.data ?? []}
      keyExtractor={(item) => item.id}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            deals.refresh();
            if (!isLister) viewings.refresh();
          }}
          tintColor={p.brand}
        />
      }
      ListHeaderComponent={
        <View style={{ paddingTop: topInset + space.md }}>
          <Title>{isLister ? 'Your lettings' : 'Your rentals'}</Title>
          <BodySm style={{ marginTop: space.xs }}>
            {isLister
              ? 'Every let in progress, and where each one has reached.'
              : 'Money you place with us is held in escrow until you confirm you have moved in.'}
          </BodySm>

          {deals.error && (
            <View style={{ marginTop: space.gutter }}>
              <Alert
                tone="error"
                message={deals.error.message}
                code={deals.error.code}
              />
            </View>
          )}
          {deals.loading && <Loading />}

          {!isLister && (viewings.data?.length ?? 0) > 0 && (
            <>
              <Heading>Your viewings</Heading>
              <View style={{ gap: space.md, marginBottom: space.md }}>
                {viewings.data!.map((viewing) => (
                  <Card key={viewing.id}>
                    {/* No thumbnail: a viewing is an appointment, and the
                        only things that matter about it are when it is and
                        what happens next. */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space.md,
                        marginBottom: space.sm,
                      }}
                    >
                      <CalendarIcon size={20} color={p.inkSoft} />
                      <Body style={{ flex: 1 }}>
                        {new Date(viewing.scheduledFor).toLocaleString(
                          undefined,
                          {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}
                      </Body>
                      <Pill tone={VIEWING_TONE[viewing.status]}>
                        {VIEWING_LABEL[viewing.status]}
                      </Pill>
                    </View>
                    <BodySm>{VIEWING_EXPLAIN[viewing.status]}</BodySm>
                  </Card>
                ))}
              </View>
              <Heading>Rentals</Heading>
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        deals.loading || deals.error ? null : (
          <Empty
            title={isLister ? 'No lets in progress' : 'No rentals yet'}
            message={
              isLister
                ? 'A let opens here once one of our officers has introduced a tenant to one of your properties. Nothing is owed until one completes.'
                : 'A rental opens after you have seen a home with one of our officers. Start by finding one and requesting a viewing.'
            }
            action={
              isLister ? null : (
                <Button
                  label="Find a home"
                  onPress={() => router.push('/(app)/home')}
                />
              )
            }
          />
        )
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push(`/(app)/deal/${item.id}`)}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
            }}
          >
            <View style={{ flex: 1, gap: space.xs }}>
              {item.monthlyRentSnapshot ? (
                <Price
                  amount={formatShillingsCompact(item.monthlyRentSnapshot)}
                  per="/ month"
                />
              ) : (
                <Body>Rent not yet fixed</Body>
              )}
              <BodySm tone="faint">
                Opened {new Date(item.createdAt).toLocaleDateString()}
              </BodySm>
            </View>
            <View style={{ alignItems: 'flex-end', gap: space.sm }}>
              <DealStatePill status={item.status} />
            </View>
            <ChevronRightIcon size={20} color={p.inkFaint} />
          </View>
        </Card>
      )}
    />
  );
}
