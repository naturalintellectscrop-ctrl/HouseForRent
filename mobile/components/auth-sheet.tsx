import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AuthBackdrop } from '@/components/auth-backdrop';
import { Body, Title } from '@/components/ui';
import { elevation, font, radius, space, usePalette } from '@/lib/theme';

/**
 * The bottom sheet the auth forms sit in, as in the reference: the collage
 * shows through above, and the sheet floats over it with a grab handle.
 */
export function AuthSheet({
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
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <View
        style={{
          ...StyleSheetAbsoluteTop,
          height: 320,
          overflow: 'hidden',
        }}
      >
        <AuthBackdrop rows={2} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={{
            backgroundColor: p.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingTop: space.md,
            maxHeight: '86%',
            ...elevation.raised,
          }}
        >
          {/* Grab handle, as in the reference sheets. */}
          <View
            style={{
              width: 44,
              height: 4,
              borderRadius: radius.pill,
              backgroundColor: p.line,
              alignSelf: 'center',
              marginBottom: space.lg,
            }}
          />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: space.xl,
              paddingBottom: space.xxl,
            }}
          >
            <Title>{title}</Title>
            <Body muted style={{ marginBottom: space.xl }}>
              {subtitle}
            </Body>

            {children}

            <Pressable
              accessibilityRole="link"
              onPress={() => router.replace(footerHref as never)}
              style={{ paddingVertical: space.md, alignItems: 'center' }}
            >
              <Text style={{ fontSize: font.small, color: p.inkSoft }}>
                {footerPrompt}{' '}
                <Text style={{ color: p.brand, fontWeight: '800' }}>
                  {footerAction}
                </Text>
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const StyleSheetAbsoluteTop = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
};
