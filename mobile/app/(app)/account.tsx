import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { API_BASE } from '@/lib/api';
import {
  Alert,
  Body,
  BodySm,
  Button,
  Card,
  Divider,
  Heading,
  Label,
  Pill,
  Row,
  Title,
} from '@/components/ui';
import { space, usePalette } from '@/lib/theme';

/**
 * The account tab.
 *
 * ── What is deliberately absent ──
 * No identity-document upload, no payslip, no bank statement. V1 screening
 * is identity-only and ability-to-pay is evidenced by escrow funding, not
 * by documents (FR-6.3, Decision 10) — a field here asking for one would be
 * collecting data the platform has decided not to hold.
 *
 * No fee schedule for tenants either. There is nothing to show: tenants pay
 * House For Rent nothing, and that is structural rather than promotional
 * (Decision 3, FR-9.2).
 */
export default function Account() {
  const p = usePalette();
  const router = useRouter();
  const { caller, signOut } = useSession();
  const [busy, setBusy] = useState(false);

  const isLister = caller?.role === 'lister';

  return (
    <ScrollView
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={{ padding: space.screen, paddingBottom: space.section }}
    >
      {/* The logo used to sit here in a card of its own. A user who has
          opened the account tab of an app they installed does not need to
          be told which app it is; what they came for is what follows. */}
      <Title>Account</Title>
      <BodySm style={{ marginBottom: space.lg }}>
        {isLister
          ? 'You are listing property with House For Rent.'
          : 'You are looking for a home. We charge you nothing.'}
      </BodySm>

      <Card>
        <Row
          label="Account type"
          value={<Pill tone="brand">{isLister ? 'Landlord' : 'Tenant'}</Pill>}
        />
        <Divider />
        <Row label="Reference" value={caller?.partyId.slice(0, 8) ?? '—'} />
      </Card>

      {!isLister && (
        <>
          <Heading>What you pay us</Heading>
          <Card>
            <Label>
              Nothing — not to search, not to view, not to move in.
            </Label>
            <BodySm style={{ marginTop: space.sm }}>
              Our commission is paid by the landlord, and only when a let
              actually succeeds. That is why our officer meets you at the
              property at our own cost.
            </BodySm>
          </Card>

          <Heading>Your money</Heading>
          <Card>
            <Body>
              Anything you pay upfront is held in escrow by a licensed
              payment provider — never by us — until you confirm you have
              moved in.
            </Body>
            <BodySm style={{ marginTop: space.sm }}>
              If you cannot move in, it comes back to you in full. There is
              no path in our system that releases it to a landlord before you
              confirm.
            </BodySm>
          </Card>
        </>
      )}

      {isLister && (
        <>
          <Heading>Our commission</Heading>
          <Card>
            <Label>
              Charged only on a successful let.
            </Label>
            <BodySm style={{ marginTop: space.sm }}>
              Calculated from one month of the rent agreed at signing. The
              rate is fixed for each let at the moment you sign its
              agreement — a later change to our standard rate cannot re-price
              a let already signed.
            </BodySm>
          </Card>
        </>
      )}

      <Heading>Identity</Heading>
      <Card>
        <BodySm>
          {isLister
            ? 'Verification is handled with our team when your property is inspected.'
            : 'Identity verification is required before you can request a viewing — our officer meets you at a stranger’s home, so we confirm who you are first. Our team completes this with you.'}
        </BodySm>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <Button
          label="Sign out"
          variant="outline"
          busy={busy}
          onPress={async () => {
            setBusy(true);
            await signOut();
            router.replace('/(auth)/welcome');
          }}
        />
      </View>

      {/* Which API this build points at is a question for whoever is
          testing the build, not for a tenant. It stays reachable in
          development and ships to nobody. */}
      {__DEV__ && (
        <View style={{ marginTop: space.lg }}>
          <Alert tone="note" message={`Development build — API ${API_BASE}`} />
        </View>
      )}
    </ScrollView>
  );
}
