import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { ApiError, OfflineError } from '@/lib/api';
import { AuthScreen } from '@/components/auth-screen';
import { Alert, Button, Field, RevealToggle } from '@/components/ui';
import { space } from '@/lib/theme';

export default function SignIn() {
  const { signIn } = useSession();
  const router = useRouter();

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
              ? 'That phone number and password did not match an account.'
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
    <AuthScreen
      title="Sign in"
      subtitle="Use the phone number you registered with."
      footerPrompt="No account yet?"
      footerAction="Create one"
      footerHref="/(auth)/register"
    >
      {error && <Alert tone="error" message={error.message} code={error.code} />}

      <Field
        label="Phone number"
        value={primaryPhone}
        onChangeText={setPhone}
        placeholder="07XX XXX XXX"
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        textContentType="telephoneNumber"
        editable={!busy}
      />

      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        editable={!busy}
        onSubmitEditing={submit}
        returnKeyType="go"
        trailing={
          <RevealToggle
            revealed={reveal}
            onToggle={() => setReveal((v) => !v)}
          />
        }
      />

      <Button
        label="Sign in"
        onPress={submit}
        busy={busy}
        style={{ marginTop: space.sm }}
      />
    </AuthScreen>
  );
}
