import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { Body, Button, Screen, Title, Wordmark } from '@/components/ui';
import { space } from '@/lib/theme';

/**
 * Staff signed in on the wrong surface.
 *
 * The FOO and admin experience is deliberately a responsive web console
 * (Technical Architecture §7 — "web, not mobile, for V1 ... it's an
 * internal ops tool where clarity, form density, and speed beat native
 * polish"). Half-building it here would create a second home for field
 * rules to drift in, so this says so plainly instead.
 */
export default function StaffRedirect() {
  const { signOut, caller } = useSession();
  const router = useRouter();

  return (
    <Screen style={{ justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', marginBottom: space.xl }}>
        <Wordmark size="sm" />
      </View>

      <Title>Use the field console</Title>
      <Body muted style={{ marginBottom: space.xl }}>
        This app is for tenants and landlords. Your account is{' '}
        {caller?.role === 'admin' ? 'an admin' : 'a field officer'}, and the
        officer and admin tools live in the web console — built for form
        density, and it works on a phone browser.
      </Body>

      <Button
        label="Sign out"
        variant="outline"
        onPress={async () => {
          await signOut();
          router.replace('/(auth)/welcome');
        }}
      />
    </Screen>
  );
}
