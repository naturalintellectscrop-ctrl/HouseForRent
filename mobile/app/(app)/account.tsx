import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { API_BASE } from '@/lib/api';
import {
  Alert,
  Body,
  Button,
  Card,
  Divider,
  Heading,
  Pill,
  Row,
  Title,
  Wordmark,
} from '@/components/ui';
import { radius, space, usePalette } from '@/lib/theme';

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
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxxl }}
    >
      <View
        style={{
          alignItems: 'center',
          paddingVertical: space.xl,
          marginBottom: space.lg,
          backgroundColor: p.surface,
          borderRadius: radius.md,
        }}
      >
        <Wordmark size="sm" />
        <View style={{ marginTop: space.md }}>
          <Pill tone="brand">{isLister ? 'Landlord' : 'Tenant'}</Pill>
        </View>
      </View>

      <Title>Your account</Title>
      <Body muted style={{ marginBottom: space.lg }}>
        {isLister
          ? 'You are listing property with House For Rent.'
          : 'You are looking for a home. We charge you nothing.'}
      </Body>

      <Card>
        <Row label="Account type" value={isLister ? 'Landlord' : 'Tenant'} />
        <Divider />
        <Row label="Reference" value={caller?.partyId.slice(0, 8) ?? '—'} />
      </Card>

      {!isLister && (
        <>
          <Heading>What you pay us</Heading>
          <Card>
            <Body style={{ fontWeight: '800' }}>
              Nothing — not to search, not to view, not to move in.
            </Body>
            <Body muted style={{ marginTop: space.sm }}>
              Our commission is paid by the landlord, and only when a let
              actually succeeds. That is why our officer meets you at the
              property at our own cost.
            </Body>
          </Card>

          <Heading>Your money</Heading>
          <Card>
            <Body>
              Anything you pay upfront is held in escrow by a licensed
              payment provider — never by us — until you confirm you have
              moved in.
            </Body>
            <Body muted style={{ marginTop: space.sm }}>
              If you cannot move in, it comes back to you in full. There is
              no path in our system that releases it to a landlord before you
              confirm.
            </Body>
          </Card>
        </>
      )}

      {isLister && (
        <>
          <Heading>Our commission</Heading>
          <Card>
            <Body style={{ fontWeight: '800' }}>
              Charged only on a successful let.
            </Body>
            <Body muted style={{ marginTop: space.sm }}>
              Calculated from one month of the rent agreed at signing. The
              rate is fixed for each let at the moment you sign its
              agreement — a later change to our standard rate cannot re-price
              a let already signed.
            </Body>
          </Card>
        </>
      )}

      <Heading>Identity</Heading>
      <Card>
        <Body muted>
          {isLister
            ? 'Verification is handled with our team when your property is inspected.'
            : 'Identity verification is required before you can request a viewing — our officer meets you at a stranger’s home, so we confirm who you are first. Our team completes this with you.'}
        </Body>
      </Card>

      <Heading>Connection</Heading>
      <Alert tone="note" message={`Talking to ${API_BASE}`} />

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
    </ScrollView>
  );
}
