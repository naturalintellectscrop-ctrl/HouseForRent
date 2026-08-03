import { Stack } from 'expo-router';
import { usePalette } from '@/lib/theme';

/**
 * The auth flow is headerless throughout — each screen owns its own
 * chrome, as in the reference where the sheet floats over the collage with
 * no navigation bar above it.
 */
export default function AuthLayout() {
  const p = usePalette();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: p.bg },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="register" />
      <Stack.Screen name="staff" />
    </Stack>
  );
}
