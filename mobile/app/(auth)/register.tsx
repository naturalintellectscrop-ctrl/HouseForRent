import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { ApiError, OfflineError } from '@/lib/api';
import { AuthSheet } from '@/components/auth-sheet';
import { Alert, Body, Button, ChipRow, Field } from '@/components/ui';
import { space, usePalette } from '@/lib/theme';

/**
 * Self-service registration.
 *
 * Only `tenant` and `lister` are offered — and the server refuses anything
 * else regardless (API Spec §3): `foo` and `admin` can verify properties,
 * decide mandates and change configuration, so allowing signup to mint one
 * would make every downstream control decorative.
 *
 * The reference collects Name / Email / Password / Confirm. Ours collects
 * Name / PHONE / Password, because accounts here are keyed to a phone
 * number — verification runs against a Ugandan NIN and MSISDN, and the
 * escrow rails are mobile money. There is no email field to add.
 */
export default function Register() {
  const { register } = useSession();
  const router = useRouter();
  const p = usePalette();

  const [role, setRole] = useState<'tenant' | 'lister'>('tenant');
  const [displayName, setDisplayName] = useState('');
  const [primaryPhone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!displayName.trim() || !primaryPhone.trim() || !password) {
      setError({ message: 'Name, phone number and password are required.' });
      return;
    }
    if (password !== confirm) {
      setError({ message: 'The two passwords do not match.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ displayName, primaryPhone, password, role });
      router.replace('/');
    } catch (err) {
      if (err instanceof OfflineError) setError({ message: err.message });
      else if (err instanceof ApiError)
        setError({ message: err.message, code: err.code });
      else setError({ message: 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const eye = (
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
  );

  return (
    <AuthSheet
      title="Create an Account"
      subtitle="Sign up to start your home search"
      footerPrompt="Already have an account?"
      footerAction="Login"
      footerHref="/(auth)/sign-in"
    >
      {error && <Alert tone="error" message={error.message} code={error.code} />}

      <View style={{ marginBottom: space.lg }}>
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: p.ink,
            marginBottom: space.sm,
          }}
        >
          I am
        </Text>
        <ChipRow
          value={role}
          onChange={setRole}
          options={[
            { value: 'tenant', label: 'Looking for a home' },
            { value: 'lister', label: 'Renting out property' },
          ]}
        />
        <Body faint style={{ marginTop: space.sm }}>
          You can be both later — this only sets where you start.
        </Body>
      </View>

      <Field
        label="Name"
        glyph="◑"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Enter your full name"
        autoCapitalize="words"
        autoComplete="name"
        editable={!busy}
      />

      <Field
        label="Phone number"
        glyph="☏"
        value={primaryPhone}
        onChangeText={setPhone}
        placeholder="Enter your phone number"
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        editable={!busy}
        hint="Used to verify you and to move money. Not shared with landlords."
      />

      <Field
        label="Password"
        glyph="🔒"
        value={password}
        onChangeText={setPassword}
        placeholder="Enter your password"
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!busy}
        trailing={eye}
      />

      <Field
        label="Confirm Password"
        glyph="🔒"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Re-enter your password"
        secureTextEntry={!reveal}
        autoCapitalize="none"
        editable={!busy}
        error={confirm.length > 0 && confirm !== password}
        trailing={eye}
      />

      <Button label="Sign Up" onPress={submit} busy={busy} />
    </AuthSheet>
  );
}
