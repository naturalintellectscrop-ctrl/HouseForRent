import Link from 'next/link';
import { LoginForm } from './login-form';
import { AuthAside } from '../register/auth-aside';
import { Brand } from '@/app/ui';

export const metadata = {
  title: 'Sign in',
  description: 'Sign in to House For Rent.',
};

export default async function LoginPage(props: {
  searchParams: Promise<{ reason?: string; next?: string }>;
}) {
  const { reason, next } = await props.searchParams;

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="auth-form stack-lg">
          <Brand />

          <div className="stack-sm">
            <h1 className="h1">Sign in</h1>
            <p className="muted">
              Tenants, landlords, field officers and operations all sign in
              here. We show you the right thing based on your account.
            </p>
          </div>

          {reason === 'staff-only' ? (
            <p className="notice notice-warn">
              That account is not a field officer or admin, so it has no
              operations console to show.
            </p>
          ) : null}

          <LoginForm next={next ?? null} />

          <p className="muted" style={{ fontSize: '0.9375rem' }}>
            No account yet?{' '}
            <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}>
              Create one
            </Link>{' '}
            — it takes a minute and costs nothing.
          </p>
        </div>
      </div>

      <AuthAside />
    </div>
  );
}
