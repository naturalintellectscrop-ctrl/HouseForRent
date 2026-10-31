'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import { ApiAlert } from '@/app/ui';

/**
 * Provision a staff account - the owner adds an administrator or field
 * officer directly from Settings.
 *
 * ── Why the password is generated here and shown once ──
 * There is no email infrastructure to deliver an invitation, so the
 * credential is generated in the browser, sent to the server where it is
 * only ever stored as a bcrypt hash, and displayed ONCE for the owner to
 * hand over on a private channel. The roster asks the new staff member to
 * change it after first sign-in. Every provisioning lands on the audit
 * trail with the acting owner's identity - this form posts to the same
 * /ops/staff route the staff console has always used.
 */
function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = new Uint32Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('') + '!7';
}

export function StaffProvisionControl() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [role, setRole] = useState<'foo' | 'admin'>('foo');
  const [password, setPassword] = useState('');
  const [generated, setGenerated] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(null);
  const [created, setCreated] = useState<{
    displayName: string;
    primaryPhone: string;
    role: string;
    password: string;
  } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (displayName.trim().length < 2) {
      setError({ message: 'Enter the staff member\u2019s full name.' });
      return;
    }
    if (primaryPhone.replace(/\D/g, '').length < 9) {
      setError({ message: 'Enter their phone number, including the country code.' });
      return;
    }
    if (password.length < 8) {
      setError({ message: 'Choose a password of at least 8 characters - or use Generate.' });
      return;
    }
    setPending(true);
    try {
      await postJson('/ops/staff', {
        displayName: displayName.trim(),
        primaryPhone: primaryPhone.trim(),
        password,
        role,
      });
      setCreated({
        displayName: displayName.trim(),
        primaryPhone: primaryPhone.trim(),
        role: role === 'admin' ? 'Administrator' : 'Field officer',
        password,
      });
      setDisplayName('');
      setPrimaryPhone('');
      setPassword('');
      setGenerated(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        setError({ message: err.message, code: err.code });
      } else {
        setError({ message: 'Could not reach the House For Rent API - nothing was created. Try again when you have signal.' });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="stack-sm">
      {created ? (
        <div className="notice notice-ok" role="status">
          <strong>{created.displayName}</strong> is provisioned as{' '}
          <strong>{created.role}</strong>. Their sign-in, shown once - hand it
          over on a private channel:
          <ul style={{ margin: '0.4rem 0 0.2rem', paddingLeft: '1.2rem' }}>
            <li>
              Phone: <code>{created.primaryPhone}</code>
            </li>
            <li>
              Password: <code>{created.password}</code>
            </li>
          </ul>
          Ask them to change it after first sign-in. This panel will not show
          the password again.
        </div>
      ) : null}

      <form className="row" style={{ gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }} onSubmit={submit}>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 180px' }}>
          <label className="label" htmlFor="staff-name">
            Full name
          </label>
          <input
            id="staff-name"
            className="input"
            autoComplete="off"
            placeholder="e.g. Grace Atim"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 160px' }}>
          <label className="label" htmlFor="staff-phone">
            Phone
          </label>
          <input
            id="staff-phone"
            className="input"
            autoComplete="off"
            inputMode="tel"
            placeholder="+256 7…"
            value={primaryPhone}
            onChange={(e) => setPrimaryPhone(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
          <label className="label" htmlFor="staff-role">
            Role
          </label>
          <select
            id="staff-role"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value === 'admin' ? 'admin' : 'foo')}
          >
            <option value="foo">Field officer</option>
            <option value="admin">Administrator</option>
          </select>
        </div>
        <div className="field" style={{ marginBottom: 0, flex: '1 1 200px' }}>
          <label className="label" htmlFor="staff-password">
            Temporary password
          </label>
          <span className="row" style={{ gap: '0.4rem', flexWrap: 'nowrap' }}>
            <input
              id="staff-password"
              className="input"
              autoComplete="off"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setGenerated(false);
              }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setPassword(generatePassword());
                setGenerated(true);
              }}
            >
              Generate
            </button>
          </span>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? 'Creating…' : 'Add staff account'}
        </button>
      </form>
      {generated ? (
        <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
          Generated password - copy it before creating the account; it is
          stored only as a hash and displayed once after creation.
        </p>
      ) : null}
      <p className="faint" style={{ fontSize: '0.8125rem', margin: 0 }}>
        An <strong>administrator</strong> holds the full platform register
        (this console, approvals, listings, transactions, money). A{' '}
        <strong>field officer</strong> works the field register: viewings,
        introductions, field evidence - no money, no application decisions.
      </p>
      {error ? <ApiAlert message={error.message} code={error.code} /> : null}
    </div>
  );
}
