'use client';

import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * A password field with a show/hide toggle - the eye every sign-in form
 * is expected to have.
 *
 * ── Why a separate client file ──
 * Nothing around the forms needs JavaScript; only this field does. Keeping
 * it in its own small client module means a visit to /login ships the
 * toggle and nothing else.
 *
 * ── The field always carries the shared input treatment ──
 * The inner input is rendered with the shared `.input` class (merged with
 * anything the caller passes). It used to carry no class at all: the old
 * console register happened to style bare inputs itself, but public doors
 * style fields through the class - so on /login, /register and the
 * operator login the password box collapsed to the browser's default
 * width while the eye sat at the far edge of the row. The class makes the
 * field identical to the input beside it on every surface, and the
 * `.password-wrap` rules reserve the trailing space the eye occupies.
 *
 * ── Accessibility ──
 * The toggle is a real button with `type="button"` (it must never submit
 * the form), a flipping `aria-label`/`title` and `aria-pressed`, so a
 * screen reader announces "Show password, pressed" rather than an unnamed
 * glyph. `onMouseDown` is cancelled so pressing the eye does not steal
 * focus from the field you are typing in.
 */

export function PasswordInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>,
) {
  const [visible, setVisible] = useState(false);
  const { className, ...rest } = props;

  return (
    <span className="password-wrap">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={className ? `input ${className}` : 'input'}
      />
      <button
        type="button"
        className="password-eye"
        onClick={() => setVisible((v) => !v)}
        onMouseDown={(e) => e.preventDefault()}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOffGlyph /> : <EyeGlyph />}
      </button>
    </span>
  );
}

/* ── glyphs ─────────────────────────────────────────────────────────── */

/* Lucide's Eye / EyeOff: the same professionally-drawn 24-grid set the
   shared Icon vocabulary moved to. Tree-shaken here so this stays the
   only thing the client bundle carries. */

function EyeGlyph() {
  return <Eye size={18} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}

function EyeOffGlyph() {
  return <EyeOff size={18} strokeWidth={1.75} aria-hidden="true" focusable="false" />;
}
