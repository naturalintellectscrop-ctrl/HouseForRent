import { Redirect, Tabs } from 'expo-router';
import { useSession } from '@/lib/session';
import { Loading } from '@/components/ui';
import {
  CalendarIcon,
  HomeIcon,
  PersonIcon,
  SearchIcon,
} from '@/components/icons';
import { fontFamily, space, type as t, usePalette } from '@/lib/theme';

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

  /**
   * ── Icon and label, both ──
   * The tabs once rendered `⌂`, `♡` and `◑` — obscure code points that fall
   * back to an empty box on many Android builds, with the label appearing
   * only on the tab already selected, which is the one tab whose identity
   * nobody needed explained. They are now drawn paths from the app's own
   * icon set, and every tab carries its name at all times.
   */
  return (
    <Tabs
      screenOptions={{
        // Each tab screen renders its own <Title>, which gives it control
        // over the copy and the spacing beneath it. Leaving the navigator
        // header on as well printed "Find a home" twice down the top of the
        // screen, and cost a whole header's height for the privilege.
        headerShown: false,
        headerStyle: { backgroundColor: p.bg },
        headerShadowVisible: false,
        headerTintColor: p.ink,
        headerTitleStyle: { fontFamily: fontFamily.semibold, fontSize: 18 },
        tabBarActiveTintColor: p.brand,
        tabBarInactiveTintColor: p.inkFaint,
        tabBarLabelStyle: {
          fontFamily: fontFamily.semibold,
          fontSize: t.labelSm.fontSize,
        },
        tabBarStyle: {
          backgroundColor: p.surface,
          borderTopWidth: 1,
          borderTopColor: p.line,
          height: 64,
          paddingTop: space.sm,
        },
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: isLister ? 'Your listings' : 'Find a home',
          tabBarLabel: isLister ? 'Listings' : 'Search',
          tabBarIcon: ({ color }) =>
            isLister ? (
              <HomeIcon size={24} color={color} />
            ) : (
              <SearchIcon size={24} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="deals"
        options={{
          title: isLister ? 'Your lettings' : 'Your rentals',
          tabBarLabel: isLister ? 'Lettings' : 'Rentals',
          tabBarIcon: ({ color }) => <CalendarIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarLabel: 'Account',
          tabBarIcon: ({ color }) => <PersonIcon size={24} color={color} />,
        }}
      />
      {/* Detail routes live in the tab tree but are not themselves tabs.
          These DO keep the navigator header: it carries the back affordance,
          and unlike the tab screens they are pushed onto a stack you have to
          be able to get out of. */}
      {/* The tab bar is hidden on both: each carries its own pinned action,
          and stacking a tab bar under that gives the bottom of the screen
          two competing bars and about a fifth of the viewport. You leave
          these by the back arrow, which the header provides. */}
      <Tabs.Screen
        name="listing/[id]"
        options={{
          href: null,
          title: 'Home details',
          headerShown: true,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="deal/[id]"
        options={{
          href: null,
          title: 'Rental',
          headerShown: true,
          tabBarStyle: { display: 'none' },
        }}
      />
    </Tabs>
  );
}
