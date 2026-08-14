import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '@/lib/session';
import { FONT_ASSETS, fontFamily, usePalette } from '@/lib/theme';

/**
 * Root layout. `SessionProvider` wraps everything so any screen can issue an
 * authenticated request without threading a token through props — and so
 * there is exactly ONE place that holds credentials.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Shell() {
  const p = usePalette();
  // Bundled, so this resolves from local storage on the first frame rather
  // than over the network. `error` is surfaced by rendering anyway: a
  // missing typeface should degrade to the system font, never to a blank
  // app someone cannot sign in to.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  if (!fontsLoaded && !fontError) {
    // The page colour, held for the frame or two the fonts take. Anything
    // more elaborate would flash and then be replaced.
    return <View style={{ flex: 1, backgroundColor: p.bg }} />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: p.bg },
          headerTintColor: p.ink,
          headerTitleStyle: { fontFamily: fontFamily.semibold, fontSize: 18 },
          contentStyle: { backgroundColor: p.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
