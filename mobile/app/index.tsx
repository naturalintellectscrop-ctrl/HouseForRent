import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { useSession } from '@/lib/session';
import { Loading } from '@/components/ui';
import { usePalette } from '@/lib/theme';

/**
 * The entry gate.
 *
 * Staff (`foo` / `admin`) are sent to the console, not given a mobile shell:
 * the FOO surface is deliberately a responsive web console (Technical
 * Architecture §7), and half-building it here would create a second place
 * for field rules to live.
 */
export default function Index() {
  const { caller, loading } = useSession();
  const p = usePalette();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }

  if (!caller) return <Redirect href="/(auth)/welcome" />;
  if (caller.role === 'foo' || caller.role === 'admin') {
    return <Redirect href="/(auth)/staff" />;
  }
  return <Redirect href="/(app)/home" />;
}
