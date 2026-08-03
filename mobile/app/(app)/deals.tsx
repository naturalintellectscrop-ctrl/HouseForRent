import { FlatList, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthedRequest } from '@/lib/use-request';
import { useSession } from '@/lib/session';
import type { Deal, Viewing } from '@/lib/api';
import { formatShillingsCompact } from '@/lib/money';
import {
  Alert,
  Body,
  Card,
  Empty,
  Heading,
  Loading,
  PhotoPlaceholder,
  Pill,
  Price,
  Title,
} from '@/components/ui';
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
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
      data={deals.data ?? []}
      keyExtractor={(item) => item.id}
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
        <View>
          <Title>{isLister ? 'Your lettings' : 'Your rentals'}</Title>
          <Body muted style={{ marginBottom: space.lg }}>
            {isLister
              ? 'Every let in progress, and where each one has reached.'
              : 'Money you place with us is held in escrow until you confirm you have moved in.'}
          </Body>

          {deals.error && (
            <Alert
              tone="error"
              message={deals.error.message}
              code={deals.error.code}
            />
          )}
          {deals.loading && <Loading />}

          {!isLister && (viewings.data?.length ?? 0) > 0 && (
            <>
              <Heading>Your viewings</Heading>
              {viewings.data!.map((viewing) => (
                <Card key={viewing.id} style={{ padding: space.md }}>
                  <View style={{ flexDirection: 'row', gap: space.md }}>
                    <PhotoPlaceholder size={64} glyph="⌕" />
                    <View style={{ flex: 1 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          gap: space.sm,
                          marginBottom: space.xs,
                        }}
                      >
                        <Body style={{ fontWeight: '800', flex: 1 }}>
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
                      <Body muted>{VIEWING_EXPLAIN[viewing.status]}</Body>
                    </View>
                  </View>
                </Card>
              ))}
              <Heading>Rentals</Heading>
            </>
          )}
        </View>
      }
      ListEmptyComponent={
        deals.loading || deals.error ? null : (
          <Empty
            title={isLister ? 'No lets yet' : 'No rentals yet'}
            glyph="♡"
            message={
              isLister
                ? 'A let opens once one of our officers introduces a tenant to your property.'
                : 'Find a home and request a viewing. A rental opens after you have seen the place with one of our officers.'
            }
          />
        )
      }
      renderItem={({ item }) => (
        <Card
          onPress={() => router.push(`/(app)/deal/${item.id}`)}
          style={{ padding: space.md }}
        >
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <PhotoPlaceholder size={64} />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: space.sm,
                }}
              >
                <View style={{ flex: 1 }}>
                  {item.monthlyRentSnapshot ? (
                    <Price
                      amount={formatShillingsCompact(item.monthlyRentSnapshot)}
                      per="/month"
                    />
                  ) : (
                    <Body style={{ fontWeight: '800' }}>
                      Rent not yet fixed
                    </Body>
                  )}
                </View>
                <DealStatePill status={item.status} />
              </View>
              <Body faint style={{ marginTop: space.xs }}>
                Opened {new Date(item.createdAt).toLocaleDateString()}
              </Body>
            </View>
          </View>
        </Card>
      )}
    />
  );
}
