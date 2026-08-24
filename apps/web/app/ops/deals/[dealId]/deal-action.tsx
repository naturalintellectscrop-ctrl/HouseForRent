'use client';

import { useActionState, useState } from 'react';
import { dealTransitionAction } from '@/app/actions/deals';
import { IDLE, type ActionState } from '@/app/actions/state';
import type { AvailableDealAction } from '@/lib/api';
import { shillings } from '@/app/ui';

/**
 * One transition the SERVER says is currently available (F-007).
 *
 * Everything rendered here — the label, the consequence, the fields, whether
 * it moves money, whether it can be undone — arrives from
 * `availableActions`. This component knows nothing about deals: it does not
 * know what `settle` means, which status permits it, or who may call it. It
 * renders what it is given and posts it back.
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
  const [state, submit, pending] = useActionState<ActionState, FormData>(
    dealTransitionAction.bind(null, dealId, action.action),
    IDLE,
  );
  const [acknowledged, setAcknowledged] = useState(false);

  /** Money actions, and anything terminal, ask for an explicit tick. */
  const needsConfirmation = action.movesMoney || !action.reversible;

  /**
   * The concrete figure this action is about, when the server has one.
   * Rendered from `financial`, never recomputed — the console does no
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

  return (
    <form action={submit} className="deal-action">
      <div className="card-head">
        <span className="card-title">{action.label}</span>
        {action.movesMoney && <span className="pill pill-warn">moves money</span>}
        {!action.reversible && (
          <span className="pill pill-danger">irreversible</span>
        )}
      </div>

      {/* The server's own words for what happens. Not paraphrased here —
          the backend owns the meaning of its transitions. */}
      <p className="muted">{action.consequence}</p>

      {state.error && (
        <p className="alert alert-error" role="alert">
          {state.error} {state.code && <code>{state.code}</code>}
        </p>
      )}
      {state.ok && <p className="alert alert-ok">{state.ok}</p>}

      {action.fields.map((field) => {
        const id = `${action.action}-${field.name}`;
        return (
          <div className="field" key={field.name}>
            <label htmlFor={id}>{field.label}</label>
            <input
              id={id}
              name={field.name}
              type="text"
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
        className={action.movesMoney ? 'btn-danger' : undefined}
        disabled={pending || (needsConfirmation && !acknowledged)}
      >
        {pending ? 'Working…' : action.label}
      </button>
    </form>
  );
}
