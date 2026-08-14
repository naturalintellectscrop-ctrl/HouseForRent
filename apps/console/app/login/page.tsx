import { LoginForm } from './login-form';
import { Topbar } from '../ui';

export default async function LoginPage(props: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await props.searchParams;

  return (
    <>
      <Topbar />

      <main className="shell">
        <h1>Sign in</h1>
        <p className="lede">
          Internal console for field officers and admins. Accounts are
          provisioned by an admin — there is no sign-up here.
        </p>

        {reason === 'staff-only' && (
          <p className="alert alert-note">
            That account signed in successfully but is not a field officer or
            admin, so it has no console to show.
          </p>
        )}

        <LoginForm />
      </main>
    </>
  );
}
