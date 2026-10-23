'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { postJson, ClientApiError } from '@/lib/client';
import type { AvailableDealAction } from '@/lib/api';
import { shillings } from '@/app/ui';

/**
 * One transition the SERVER says is currently available (F-007).
 *
 * Everything rendered here - the label, the consequence, the fields, whether
 * it moves money, whether it can be undone - arrives from
 * `availableActions`. This component knows nothing about deals: it does not
 * know what `settle` means, which status permits it, or who may call it. It
 * renders what it is given and posts it back to
 * `POST /api/v1/deals/:id/{action}`.
 *
 * ── The confirmation is deliberate friction ──
 * Financially meaningful actions get a checkbox that must be ticked, and the
 * checkbox text names the ACTUAL AMOUNT and says plainly whether the action
 * can be undone. "Are you sure?" tells an operator nothing they did not
 * already know and trains them to click through; "Pay the landlord
 * UGX 3,000,000. This cannot be undone." is a sentence someone can actually
 * check against what they meant to do.
 *
 * It is a safeguard against a mis-click, not a permission. The server
 * refuses an illegal transition whether or not this box was ticked, and the
 * flag is stripped before the request so it cannot be mistaken for one.
 *
 * ── Sandbox note ──
 * In the reference this component lives beside the ops console and mutates
 * through a server action. The tenant and landlord portals share it here in
 * the portal group instead, and the mutation crosses real HTTP exactly as
 * every other state change in this port does.
 */
export function DealAction({
  dealId,
  action,
  /** Server-computed figures used to fill in the confirmation sentence. */
  amounts,
}: {
  dealId: string;
  action: AvailableDealAction;
  amounts: { heldInEscrow: string; commissionAmount: string | null };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string | null } | null>(
    null,
  );
  const [ok, setOk] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  /** Money actions, and anything terminal, ask for an explicit tick. */
  const needsConfirmation = action.movesMoney || !action.reversible;

  /**
   * The concrete figure this action is about, when the server has one.
   * Rendered from `financial`, never recomputed - this page does no
   * arithmetic on money.
   */
  const figure =
    action.action === 'settle' || action.action === 'refund'
      ? amounts.heldInEscrow
      : action.action === 'earn-commission'
        ? amounts.commissionAmount
        : null;

  const confirmSentence = [
    action.label + '.',
    figure && figure !== '0' ? `Amount involved: ${shillings(figure)}.` : null,
    action.reversible
      ? 'This can be undone.'
      : 'This CANNOT be undone.',
  ]
    .filter(Boolean)
    .join(' ');

  const confirmId = `confirm-${action.action}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);

    const data = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    for (const [key, value] of data.entries()) {
      // `confirm` is the user's acknowledgement checkbox. It is a UI
      // safeguard against a mis-click, not a business field - it is
      // stripped so it cannot be mistaken for one.
      if (key === 'confirm' || typeof value !== 'string') continue;
      const trimmed = value.trim();
      if (trimmed) body[key] = trimmed;
    }

    setPending(true);
    try {
      await postJson(`/deals/${dealId}/${action.action}`, body);
      setOk('Done. The state and figures above have been reloaded from the server.');
      router.refresh();
    } catch (err) {
      if (err instanceof ClientApiError) {
        if (err.code === 'ILLEGAL_TRANSITION') {
          setError({
            message: `${err.message} This deal is no longer in the state this page was showing - someone else has acted on it. The state above has been reloaded from the server.`,
            code: err.code,
          });
        } else {
          setError({ message: err.message, code: err.code });
        }
      } else {
        setError({
          message:
            'Could not reach the House For Rent API. Nothing was changed - the deal is in whatever state the server last recorded.',
        });
      }
      // Refreshed even when the call FAILS: the most likely rejection is
      // that the deal moved on while this page was open, and leaving the
      // stale page up would show actions the server no longer permits.
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="deal-action">
      <div className="card-head">
        <span className="card-title">{action.label}</span>
        {action.movesMoney && <span className="pill pill-warn">moves money</span>}
        {!action.reversible && (
          <span className="pill pill-danger">irreversible</span>
        )}
      </div>

      {/* The server's own words for what happens. Not paraphrased here -
          the backend owns the meaning of its transitions. */}
      <p className="muted">{action.consequence}</p>

      {error && <ApiAlertInline message={error.message} code={error.code} />}
      {ok && <p className="alert alert-ok">{ok}</p>}

      {action.fields.map((field) => {
        const id = `${action.action}-${field.name}`;
        return (
          <div className="field" key={field.name}>
            <label htmlFor={id}>{field.label}</label>
            <input
              id={id}
              name={field.name}
              type="text"
              className="input"
              inputMode={field.kind === 'shillings' ? 'numeric' : 'text'}
              required={field.required}
              spellCheck={false}
            />
            {field.hint && <p className="hint">{field.hint}</p>}
          </div>
        );
      })}

      {needsConfirmation && (
        <div className="field confirm-field">
          <label htmlFor={confirmId} className="confirm-label">
            <input
              id={confirmId}
              name="confirm"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            <span>{confirmSentence}</span>
          </label>
        </div>
      )}

      <button
        type="submit"
        className={action.movesMoney ? 'btn btn-danger' : 'btn btn-primary'}
        disabled={pending || (needsConfirmation && !acknowledged)}
      >
        {pending ? 'Working…' : action.label}
      </button>
    </form>
  );
}

/**
 * The same rendering as `ApiAlert` from `@/app/ui`, which is a
 * server-rendered module - a client file re-importing it would pull nothing
 * harmful, but this keeps the portal's client bundle to the transport only.
 */
function ApiAlertInline({ message, code }: { message: string; code?: string | null }) {
  return (
    <p className="notice notice-error" role="alert">
      {message}
      {code ? (
        <>
          {' '}
          <code className="mono">{code}</code>
        </>
      ) : null}
    </p>
  );
}
