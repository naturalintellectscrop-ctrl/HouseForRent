/**
 * Shared form-action state.
 *
 * Deliberately NOT in a `'use server'` file: such a file may only export
 * async functions, so exporting a constant from one fails at runtime — and,
 * as this project found the hard way, passes `next build` and `tsc` while
 * doing so. It only surfaced under a real browser driving a real form.
 */
export interface ActionState {
  error: string | null;
  code?: string | null;
  ok?: string | null;
}

export const IDLE: ActionState = { error: null };
