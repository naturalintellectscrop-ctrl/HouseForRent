import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { BodySm, Title, Wordmark } from '@/components/ui';
import { space, type as t, usePalette } from '@/lib/theme';

/**
 * The shared frame for sign-in and registration.
 *
 * ── Why this is a page and not a bottom sheet ──
 * These forms used to sit in a floating sheet with a grab handle over a
 * collage. A sheet is a promise that there is something behind it you can
 * get back to by dismissing it; these are full-screen routes with nothing
 * behind them, so the handle was an affordance for a gesture that did not
 * exist. A page that admits it is a page also gives the form the full width
 * and the keyboard the full height, which is what a phone actually needs
 * when someone is typing a password.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  footerPrompt,
  footerAction,
  footerHref,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footerPrompt: string;
  footerAction: string;
  footerHref: string;
}) {
  const p = usePalette();
  const router = useRouter();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: p.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: space.screen,
          paddingTop: space.xl,
          paddingBottom: space.xl,
        }}
      >
        <View style={{ marginBottom: space.xl }}>
          <Wordmark size="sm" />
        </View>

        <Title>{title}</Title>
        <BodySm style={{ marginBottom: space.xl }}>
          {subtitle}
        </BodySm>

        {children}

        <Pressable
          accessibilityRole="link"
          onPress={() => router.replace(footerHref as never)}
          style={{
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
            marginTop: space.lg,
          }}
        >
          <Text style={[t.bodySm, { color: p.inkSoft }]}>
            {footerPrompt}{' '}
            <Text style={[t.labelMd, { color: p.brand }]}>{footerAction}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
