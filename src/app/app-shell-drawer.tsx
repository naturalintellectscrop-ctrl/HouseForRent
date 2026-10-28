'use client';

/**
 * The sidebar drawer's interactive shell.
 *
 * The nav CONTENT is server-rendered and arrives as children; this island
 * owns exactly one piece of state - whether the mobile overlay is open.
 * From 62rem the CSS turns the same aside into a fixed, always-visible
 * column and hides the button, so desktop ships zero behaviour beyond the
 * active-link island.
 *
 * Accessibility: a real button with aria-expanded, Escape to close, a scrim
 * button to close, and the panel is visibility:hidden while closed so it
 * leaves the tab order entirely.
 */
import { useEffect, useState } from 'react';
import { Icon } from '@/app/ui';

export function ShellDrawer({
  variant = 'light',
  children,
}: {
  variant?: 'light' | 'forest';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="shell-burger"
        aria-expanded={open}
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? null : <Icon.menu />}
      </button>
      {open ? (
        <button
          type="button"
          className="shell-scrim"
          aria-label="Close navigation menu"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={[
          'shell-side',
          open ? 'shell-side--open' : '',
          variant === 'forest' ? 'shell-side--forest' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </aside>
    </>
  );
}
