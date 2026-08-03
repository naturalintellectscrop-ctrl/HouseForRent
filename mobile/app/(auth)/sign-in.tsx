import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { ApiError, OfflineError } from '@/lib/api';
import { AuthSheet } from '@/components/auth-sheet';
import { Alert, Button, Field } from '@/components/ui';
import { usePalette } from '@/lib/theme';

export default function SignIn() {
  const { signIn } = useSession();
  const router = useRouter();
  const p = usePalette();

  const [primaryPhone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!primaryPhone.trim() || !password) {
      setError({ message: 'Enter your phone number and password.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(primaryPhone, password);
      router.replace('/');
    } catch (err) {
      if (err instanceof OfflineError) {
        setError({ message: err.message });
      } else if (err instanceof ApiError) {
        // The server compares against a dummy hash when the account is
        // absent, so a wrong number and a wrong password take the same time
        // and give the same answer. Saying more here would undo that.
        setError({
          message:
            err.status === 401
              ? 'Those details were not accepted.'
              : err.message,
          code: err.status === 401 ? undefined : err.code,
        });
      } else {
        setError({ message: 'Something went wrong. Try again.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSheet
      title="Welcome Back"
      subtitle="Login to continue your home search"
      footerPrompt="Don't have an account?"
      footerAction="Sign Up"
      footerHref="/(auth)/register"
    >
      {error && <Alert tone="error" message={error.message} code={error.code} />}

      <Field
        label="Phone number"
        glyph="☏"
        value={primaryPhone}
        onChangeText={setPhone}
        placeholder="Enter your phone number"
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        textContentType="telephoneNumber"
        editable={!busy}
      />

      <Field
        label="Password"
        glyph="🔒"
        value={password}
        onChangeText={setPassword}
        placeholder="Enter your password"
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        editable={!busy}
        onSubmitEditing={submit}
        returnKeyType="go"
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide password' : 'Show password'}
            onPress={() => setReveal((v) => !v)}
            hitSlop={12}
          >
            <Text style={{ color: p.inkFaint, fontSize: 16 }}>
              {reveal ? '◎' : '👁'}
            </Text>
          </Pressable>
        }
      />

      <Button label="Login" onPress={submit} busy={busy} />
    </AuthSheet>
  );
}
