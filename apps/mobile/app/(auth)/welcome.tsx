import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BodySm, Button, Display } from '@/components/ui';
import { FadeToPage, FilmStrip } from '@/components/film-strip';
import { space, usePalette } from '@/lib/theme';

/**
 * The first screen.
 *
 * Built to the supplied reference: a drifting wall of property photography
 * above, an all-caps eyebrow, a two-line headline whose second line carries
 * the brand green, and a Sign Up / Login pair.
 *
 * ── On the photography ──
 * These nine tiles come from the reference pack and are bundled locally
 * rather than hot-linked, so they cannot rot when the source URLs expire.
 * They are stock architectural renders, not homes on this platform — see
 * `assets/welcome/README.md`. Every other surface in this app renders an
 * honest empty frame until a field officer's capture exists, and this
 * screen is the deliberate exception: it is a mood board, not a listing,
 * and it makes no claim about any specific property.
 *
 * ── What is not here ──
 * The reference prints "Login to House For Rent with Google" beneath the
 * headline. There is no Google sign-in to offer: accounts on this platform
 * are keyed to a Ugandan MSISDN because verification runs against it and a
 * NIN, and the escrow rails are mobile money — a Google identity
 * establishes neither. A line advertising a method that does not exist
 * would send people looking for a button that was never built, so the slot
 * carries the promise the product actually keeps instead.
 */
export default function Welcome() {
  const router = useRouter();
  const p = usePalette();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: space.gutter }}>
        <View>
          <FilmStrip tiles={TILES} height={470} tileHeight={150} />
          <FadeToPage height={120} />
        </View>
      </View>

      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: space.screen,
          paddingBottom: Math.max(insets.bottom, space.gutter) + space.gutter,
        }}
      >
        <View style={{ alignItems: 'center', marginBottom: space.xl }}>
          {/* The brand line, from the identity board. The screen this
              replaced opened with a headline inherited from a template
              pack; this one is the company's own. */}
          <Display style={{ textAlign: 'center' }}>Verified homes.</Display>
          <Display style={{ textAlign: 'center' }}>Trusted rentals.</Display>
          <Display tone="brand" style={{ textAlign: 'center' }}>
            Better living.
          </Display>
          <BodySm style={{ marginTop: space.gutter, textAlign: 'center' }}>
            A trusted marketplace for quality rental homes verified by our
            Field Operations Officers.
          </BodySm>
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button
            label="Sign Up"
            style={{ flex: 1 }}
            onPress={() => router.push('/(auth)/register')}
          />
          <Button
            label="Login"
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Static requires, deliberately: Metro resolves `require` at build time, so
 * these are bundled and available on the first frame with no network at
 * all. A dynamic path would not resolve.
 */
const TILES = [
  require('@/assets/welcome/tile-1.jpg'),
  require('@/assets/welcome/tile-2.jpg'),
  require('@/assets/welcome/tile-3.jpg'),
  require('@/assets/welcome/tile-4.jpg'),
  require('@/assets/welcome/tile-5.jpg'),
  require('@/assets/welcome/tile-6.jpg'),
  require('@/assets/welcome/tile-7.jpg'),
  require('@/assets/welcome/tile-8.jpg'),
  require('@/assets/welcome/tile-9.jpg'),
];
