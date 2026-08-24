import Link from 'next/link';
import { RegisterForm } from './register-form';
import { AuthAside } from './auth-aside';
import { Brand } from '@/app/ui';

export const metadata = {
  title: 'Create an account',
  description:
    'Create a House For Rent account — free for tenants, free to list for landlords.',
};

export default async function RegisterPage(props: {
  searchParams: Promise<{ role?: string; next?: string }>;
}) {
  const { role, next } = await props.searchParams;

  // The link that brought them here can preselect, but the choice is still
  // theirs to change — and the backend refuses anything but these two
  // regardless of what is submitted (API Spec §3).
  const preset = role === 'lister' ? 'lister' : 'tenant';

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        <div className="auth-form stack-lg">
          <Brand />

          <div className="stack-sm">
            <h1 className="h1">Create an account</h1>
            <p className="muted">
              It costs nothing, whether you are looking for a home or letting
              one.
            </p>
          </div>

          <RegisterForm preset={preset} next={next ?? null} />

          <p className="muted" style={{ fontSize: '0.9375rem' }}>
            Already have one?{' '}
            <Link href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}>
              Sign in
            </Link>
            .
          </p>
        </div>
      </div>

      <AuthAside />
    </div>
  );
}
