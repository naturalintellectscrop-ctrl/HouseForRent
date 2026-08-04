import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '@/lib/session';
import { ApiError, OfflineError } from '@/lib/api';
import { AuthScreen } from '@/components/auth-screen';
import {
  Alert,
  Body,
  BodySm,
  Button,
  ChipRow,
  Field,
  RevealToggle,
} from '@/components/ui';
import { space, type as t, usePalette } from '@/lib/theme';

/**
 * Self-service registration.
 *
 * Only `tenant` and `lister` are offered — and the server refuses anything
 * else regardless (API Spec §3): `foo` and `admin` can verify properties,
 * decide mandates and change configuration, so allowing signup to mint one
 * would make every downstream control decorative.
 *
 * Three fields and a role, which is every field the platform actually
 * needs. Accounts are keyed to a phone number because verification runs
 * against a Ugandan NIN and MSISDN and the escrow rails are mobile money —
 * an email box would be a field we collect, store under the DPA, and never
 * read.
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

  const mismatch = confirm.length > 0 && confirm !== password;

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

  const reveals = (
    <RevealToggle revealed={reveal} onToggle={() => setReveal((v) => !v)} />
  );

  return (
    <AuthScreen
      title="Create your account"
      subtitle="You will need a Ugandan phone number. We verify it, and it is how money reaches you."
      footerPrompt="Already registered?"
      footerAction="Sign in"
      footerHref="/(auth)/sign-in"
    >
      {error && <Alert tone="error" message={error.message} code={error.code} />}

      <View style={{ marginBottom: space.lg }}>
        <Text style={[t.labelMd, { color: p.ink, marginBottom: space.sm }]}>
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
        <BodySm tone="faint" style={{ marginTop: space.sm }}>
          You can be both later — this only sets where you start.
        </BodySm>
      </View>

      <Field
        label="Full name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="As it appears on your ID"
        autoCapitalize="words"
        autoComplete="name"
        editable={!busy}
      />

      <Field
        label="Phone number"
        value={primaryPhone}
        onChangeText={setPhone}
        placeholder="07XX XXX XXX"
        keyboardType="phone-pad"
        autoCapitalize="none"
        autoComplete="tel"
        editable={!busy}
        hint="Used to verify you and to move money. Never shared with landlords."
      />

      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        placeholder="At least 8 characters"
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!busy}
        trailing={reveals}
      />

      <Field
        label="Confirm password"
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Type it again"
        secureTextEntry={!reveal}
        autoCapitalize="none"
        editable={!busy}
        error={mismatch ? 'This does not match the password above.' : null}
        trailing={reveals}
      />

      <Button
        label="Create account"
        onPress={submit}
        busy={busy}
        style={{ marginTop: space.sm }}
      />
    </AuthScreen>
  );
}
