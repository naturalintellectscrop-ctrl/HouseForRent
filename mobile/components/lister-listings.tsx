import { useState } from 'react';
import { FlatList, Modal, RefreshControl, ScrollView, View } from 'react-native';
import { useAuthedRequest, describeError } from '@/lib/use-request';
import { useSession } from '@/lib/session';
import type { PresentedTerms } from '@/lib/api';
import { formatShillings, formatShillingsCompact } from '@/lib/money';
import {
  Alert,
  Body,
  Button,
  Card,
  Divider,
  Empty,
  Heading,
  Loading,
  PhotoPlaceholder,
  Pill,
  Price,
  Row,
  Title,
} from '@/components/ui';
import { space, usePalette } from '@/lib/theme';

interface MyListing {
  id: string;
  monthlyRent: string;
  depositAmount: string;
  bedrooms: number;
  bathrooms: number;
  neighbourhoodName: string;
  landmarkText: string;
  verificationState: 'unverified' | 'verified';
  publicationState: string;
  hasAcceptedAgreement: boolean;
  blockedBy: string[];
  canPublish: boolean;
}

/**
 * Every blocker the server can emit has copy here. `mobile-contract.spec.ts`
 * asserts the server never emits one that is missing — otherwise a landlord
 * would be shown a raw enum key as an explanation.
 */
const BLOCKER_COPY: Record<string, string> = {
  field_verification: 'awaiting our officer’s visit',
  outside_service_area: 'outside our service area',
  mandate: 'awaiting your mandate',
  listing_agreement: 'accept the agreement',
};

/**
 * A landlord's inventory, and what each listing is waiting on.
 *
 * ── `blockedBy` and `canPublish` come from the SERVER ──
 * The publish gate has four preconditions (verified, in-corridor, mandated,
 * agreement accepted) enforced in `ListingsService.publish()`. This screen
 * renders the server's list of what is outstanding rather than recomputing
 * it — a client that decided for itself would eventually disagree, and it
 * would be the one that is wrong.
 */
export default function ListerListings() {
  const p = usePalette();
  const { data, error, loading, refreshing, refresh, reload } =
    useAuthedRequest<MyListing[]>('/v1/listings/mine');
  const [agreementFor, setAgreementFor] = useState<string | null>(null);

  return (
    <>
      <FlatList
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
        data={data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={p.brand}
          />
        }
        ListHeaderComponent={
          <View>
            <Title>Your listings</Title>
            <Body muted style={{ marginBottom: space.lg }}>
              A listing goes live once our officer has verified it in person
              and you have accepted the agreement.
            </Body>
            {error && (
              <Alert tone="error" message={error.message} code={error.code} />
            )}
            {loading && <Loading />}
          </View>
        }
        ListEmptyComponent={
          loading || error ? null : (
            <Empty
              title="No listings yet"
              glyph="⌂"
              message="Listings are created with our team while we verify the property. Get in touch to add one."
            />
          )
        }
        renderItem={({ item }) => (
          <Card style={{ padding: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <PhotoPlaceholder size={88} />

              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: space.sm,
                  }}
                >
                  <Body style={{ fontWeight: '800', flex: 1 }}>
                    {item.bedrooms} bed · {item.neighbourhoodName}
                  </Body>
                  <Pill tone={item.publicationState === 'live' ? 'ok' : 'warn'}>
                    {item.publicationState.replace(/_/g, ' ')}
                  </Pill>
                </View>

                <Body faint style={{ marginTop: 2 }}>
                  {item.landmarkText}
                </Body>

                <View style={{ marginTop: space.sm }}>
                  <Price
                    amount={formatShillingsCompact(item.monthlyRent)}
                    per="/month"
                  />
                </View>
              </View>
            </View>

            {item.blockedBy.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: space.sm,
                  flexWrap: 'wrap',
                  marginTop: space.md,
                }}
              >
                {item.blockedBy.map((blocker) => (
                  <Pill key={blocker} tone="warn">
                    {BLOCKER_COPY[blocker] ?? blocker}
                  </Pill>
                ))}
              </View>
            ) : item.publicationState !== 'live' ? (
              <View style={{ marginTop: space.md }}>
                <Pill tone="ok">ready to publish</Pill>
              </View>
            ) : null}

            {!item.hasAcceptedAgreement && (
              <View style={{ marginTop: space.md }}>
                <Button
                  label="Review the agreement"
                  variant="outline"
                  onPress={() => setAgreementFor(item.id)}
                  style={{ marginBottom: 0 }}
                />
              </View>
            )}
          </Card>
        )}
      />

      <Modal
        visible={agreementFor !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAgreementFor(null)}
      >
        {agreementFor && (
          <AgreementSheet
            listingId={agreementFor}
            onClose={() => setAgreementFor(null)}
            onAccepted={() => {
              setAgreementFor(null);
              reload();
            }}
          />
        )}
      </Modal>
    </>
  );
}

/**
 * FR-9.1 — the terms, in plain language, before acceptance.
 *
 * The commission is shown as a FIGURE in shillings, computed by the server
 * from the same pure function the deal will later use, so the number a
 * landlord accepts and the number they are charged come from one
 * implementation. This screen does no arithmetic.
 */
function AgreementSheet({
  listingId,
  onClose,
  onAccepted,
}: {
  listingId: string;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const p = usePalette();
  const { authed } = useSession();
  const { data, error, loading } = useAuthedRequest<PresentedTerms>(
    `/v1/listings/${listingId}/agreement`,
    [listingId],
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    code?: string;
  } | null>(null);

  async function accept() {
    setBusy(true);
    setFailure(null);
    try {
      await authed(`/v1/listings/${listingId}/agreement/accept`, {
        method: 'POST',
        body: {},
      });
      onAccepted();
    } catch (err) {
      setFailure(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
    >
      <Title>Listing agreement</Title>

      {loading && <Loading />}
      {error && <Alert tone="error" message={error.message} code={error.code} />}
      {failure && (
        <Alert tone="error" message={failure.message} code={failure.code} />
      )}

      {data && (
        <>
          <Card>
            <Row
              label="Monthly rent"
              value={formatShillings(data.monthlyRent)}
            />
            <Divider />
            <Row
              label="If this lets"
              value={formatShillings(data.commissionIfLet)}
              strong
            />
            <Divider />
            <Row label="Who pays" value="You, the landlord" />
            <Divider />
            <Row label="What the tenant pays us" value="Nothing" />
          </Card>

          <Heading>Commission</Heading>
          <Body style={{ marginBottom: space.md }}>
            {data.clause.commissionTerms}
          </Body>

          <Heading>If you let to a tenant we introduced</Heading>
          <Body style={{ marginBottom: space.md }}>
            {data.clause.circumventionClause}
          </Body>

          <Alert
            tone="note"
            message={`Version ${data.clause.version}. Accepting records the rate above against this listing — a later change to our standard rate cannot re-price a let signed under it.`}
          />

          {data.alreadyAccepted ? (
            <Alert
              tone="ok"
              message="You have already accepted this agreement."
            />
          ) : (
            <Button label="I accept these terms" onPress={accept} busy={busy} />
          )}
        </>
      )}

      <Button label="Close" variant="ghost" onPress={onClose} />
    </ScrollView>
  );
}
