import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  BodySm,
  Button,
  Display,
  Divider,
  Label,
  Wordmark,
} from '@/components/ui';
import {
  ChevronRightIcon,
  ShieldIcon,
  TagIcon,
  VerifiedIcon,
} from '@/components/icons';
import { space, usePalette } from '@/lib/theme';

/**
 * The first screen.
 *
 * ── The reference's line, kept verbatim ──
 * "Verified homes. You only pay when you move in." It is the best sentence
 * in the design pack: eleven words, no adjectives, and both halves are
 * enforced in code rather than promised in copy — the first by the publish
 * gate, the second by the deal state machine, which has no path that
 * releases escrow before `move_in_confirmed`.
 *
 * The screen it replaced opened with "Let's Get You Closer To Your Ideal
 * Home" over a grid of stock houses, lifted from a Flutter demo called Real
 * Scout — the same layout the reference pack's fourth folder still
 * contains, down to a "Login with Google" this product cannot offer,
 * because accounts are keyed to a Ugandan MSISDN and a Google identity
 * proves neither that nor a NIN.
 *
 * ── No hero imagery ──
 * The obvious thing to put here is a wall of houses, and we have none:
 * every property photograph comes from a field officer's capture, and V1's
 * storage provider serves no bytes. Stock photography of homes that do not
 * exist, on the opening screen of a product whose whole proposition is that
 * what you see was verified in person, would undercut the sentence beneath
 * it.
 */
export default function Welcome() {
  const router = useRouter();
  const p = usePalette();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: space.screen,
        paddingVertical: space.xl,
      }}
    >
      <View style={{ alignItems: 'center', marginBottom: space.xl }}>
        <Wordmark size="md" />
        <View style={{ marginTop: space.lg }}>
          <Display style={{ textAlign: 'center' }}>Verified homes.</Display>
          <Display tone="brand" style={{ textAlign: 'center' }}>
            You only pay when you move in.
          </Display>
        </View>
      </View>

      <View style={{ marginBottom: space.xl }}>
        <Proof
          icon={<VerifiedIcon size={20} />}
          title="Visited in person"
          detail="A House For Rent officer inspects each home and files a condition report. You read that report before you view."
        />
        <Proof
          icon={<ShieldIcon size={20} color={p.brand} />}
          title="Held in escrow"
          detail="Your upfront payment sits with a licensed provider — never with us — and is released only once you confirm you have moved in."
        />
        <Proof
          icon={<TagIcon size={20} color={p.brand} />}
          title="Free for tenants"
          detail="No search fee, no viewing fee, no fee to move in. The landlord pays our commission, and only after a completed let."
          last
        />
      </View>

      <View style={{ gap: space.md }}>
        <Button
          label="Get started"
          icon={<ChevronRightIcon size={20} color={p.brandInk} />}
          onPress={() => router.push('/(auth)/register')}
        />
        <Button
          label="I already have an account"
          variant="outline"
          onPress={() => router.push('/(auth)/sign-in')}
        />
      </View>
    </ScrollView>
  );
}

/**
 * One claim and its substance, separated by a rule rather than boxed.
 *
 * Three cards here would be three of the same shape carrying three
 * different weights of information — the repeated-card reflex the reference
 * itself falls into on its landlord screens. A rule costs one pixel and
 * groups them as the list they are.
 */
function Proof({
  icon,
  title,
  detail,
  last,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  last?: boolean;
}) {
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          gap: space.md,
          paddingVertical: space.gutter,
        }}
      >
        <View style={{ paddingTop: 2 }}>{icon}</View>
        <View style={{ flex: 1 }}>
          <Label style={{ marginBottom: 2 }}>{title}</Label>
          <BodySm>{detail}</BodySm>
        </View>
      </View>
      {last ? null : <Divider />}
    </View>
  );
}
