import { Redirect, Tabs } from 'expo-router';
import { Text, View, type ColorValue } from 'react-native';
import { useSession } from '@/lib/session';
import { Loading } from '@/components/ui';
import { font, radius, space, usePalette } from '@/lib/theme';

/**
 * The signed-in shell.
 *
 * ── One app, two modes ──
 * Technical Architecture §7 allows the landlord experience to be "mobile,
 * or a mode". It is a mode here because a party can genuinely be both — the
 * schema models role as contextual rather than fixed to a person — and
 * because duplicating auth, the API client and money formatting across two
 * codebases would create two places for each to drift.
 *
 * ── The role picks tabs, not permissions ──
 * `role` comes from `GET /v1/auth/me`, resolved server-side. It selects
 * which tabs render and nothing else: every request is authorised again by
 * the backend (NFR-1), so a tampered client sees a different menu and gets
 * exactly the same answers.
 */
export default function AppLayout() {
  const { caller, loading } = useSession();
  const p = usePalette();

  if (loading) return <Loading />;
  if (!caller) return <Redirect href="/(auth)/welcome" />;
  if (caller.role === 'foo' || caller.role === 'admin') {
    return <Redirect href="/(auth)/staff" />;
  }

  const isLister = caller.role === 'lister';

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: p.bg },
        headerShadowVisible: false,
        headerTintColor: p.ink,
        headerTitleStyle: { fontWeight: '800', fontSize: font.heading },
        tabBarActiveTintColor: p.brand,
        tabBarInactiveTintColor: p.inkFaint,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: p.surface,
          borderTopWidth: 1,
          borderTopColor: p.line,
          height: 68,
          paddingTop: space.sm,
        },
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: isLister ? 'My listings' : 'Find a home',
          tabBarAccessibilityLabel: isLister ? 'My listings' : 'Search',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph
              glyph={isLister ? '⌂' : '⌕'}
              label={isLister ? 'Listings' : 'Search'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: isLister ? 'Lettings' : 'My rentals',
          tabBarAccessibilityLabel: isLister ? 'Lettings' : 'My rentals',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph
              glyph="♡"
              label={isLister ? 'Lettings' : 'Rentals'}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarAccessibilityLabel: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <TabGlyph
              glyph="◑"
              label="Account"
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      {/* Detail routes live in the tab tree but are not themselves tabs. */}
      <Tabs.Screen
        name="listing/[id]"
        options={{ href: null, title: 'Home details' }}
      />
      <Tabs.Screen
        name="deal/[id]"
        options={{ href: null, title: 'Rental' }}
      />
    </Tabs>
  );
}

/**
 * The active tab fills into a brand-tinted pill with its label beside the
 * glyph, as in the reference; inactive tabs show the glyph alone.
 *
 * Text glyphs rather than an icon font: a typeface download for five
 * symbols is a real cost on a slow connection (NFR-5). The label is what
 * carries meaning for a screen reader — `tabBarAccessibilityLabel` above
 * names every tab regardless of which is focused.
 */
function TabGlyph({
  glyph,
  label,
  color,
  focused,
}: {
  glyph: string;
  label: string;
  // `ColorValue`, not `string`: React Navigation passes the platform's own
  // colour representation, which on Android can be an opaque handle.
  color: ColorValue;
  focused: boolean;
}) {
  const p = usePalette();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: focused ? space.md : space.sm,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        backgroundColor: focused ? p.brandSoft : 'transparent',
        minWidth: 44,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color, fontSize: 18, lineHeight: 22 }}>{glyph}</Text>
      {focused ? (
        <Text style={{ color, fontSize: font.tiny, fontWeight: '800' }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
