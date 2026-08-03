import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { Body, Button, Display, Eyebrow } from '@/components/ui';
import { space, tracking, usePalette } from '@/lib/theme';
import { Text } from 'react-native';

/**
 * The welcome screen, in the reference's layout: a property collage above,
 * an eyebrow, a two-line headline with the second line in brand colour,
 * and a Sign Up / Login pair.
 *
 * The copy is ours. The reference offers "Login with Google"; we do not —
 * accounts here are keyed to a phone number because verification runs
 * against a Ugandan NIN and MSISDN, and a Google identity proves neither.
 */
export default function Welcome() {
  const router = useRouter();
  const p = usePalette();

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <AuthBackdrop />
      </View>

      <View
        style={{
          paddingHorizontal: space.xl,
          paddingBottom: space.xxl,
          paddingTop: space.lg,
          backgroundColor: p.bg,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: space.lg }}>
          <Eyebrow>Welcome to House For Rent</Eyebrow>
          <Display>Let&apos;s Get You Closer</Display>
          <Text
            style={{
              fontSize: 30,
              fontWeight: '800',
              letterSpacing: tracking.display,
              lineHeight: 36,
              color: p.ink,
            }}
          >
            To <Text style={{ color: p.brand }}>Your Ideal Home</Text>
          </Text>
          <Body muted style={{ marginTop: space.md, textAlign: 'center' }}>
            Every home verified in person. Viewed with our officer. Free for
            tenants.
          </Body>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            label="Sign Up"
            onPress={() => router.push('/(auth)/register')}
            style={{ flex: 1, marginBottom: 0 }}
          />
          <Button
            label="Login"
            variant="outline"
            onPress={() => router.push('/(auth)/sign-in')}
            style={{ flex: 1, marginBottom: 0 }}
          />
        </View>
      </View>
    </View>
  );
}
