'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '@/app/ui';

/**
 * The control center's appearance preferences.
 *
 * ── Scope ──
 * Themes apply to the DASHBOARD only (`.shell--forest`), never to the
 * public site: the marketplace and auth surfaces are brand blocks whose
 * register is fixed by design. The preference lives on <html> as
 * `data-pf-theme` so it is readable before the first paint of any
 * platform route, and only the platform CSS layer reacts to it.
 *
 * ── No flash ──
 * The layout renders THEME_SCRIPT inline before the shell, so the stored
 * choice (or the OS preference under "system") is on <html> before the
 * first pixel of the console paints.
 *
 * ── One external store ──
 * localStorage is an external store, so every control reads it through
 * useSyncExternalStore (SSR-safe snapshot, no hydration mismatch, no
 * state-mirroring effects) and changes are announced with a window event
 * that all instances subscribe to - the Settings switch and the sidebar
 * quick toggle can never disagree.
 *
 * ── Motion ──
 * The round-64 entrance stagger is decoration; a "reduce motion" choice
 * turns it off with `data-pf-motion="reduced"`. It deliberately does not
 * touch the browser-level prefers-reduced-motion behaviour, which the
 * CSS already honours on its own.
 */

export const PF_THEME_KEY = 'hfr.pf.theme';
export const PF_MOTION_KEY = 'hfr.pf.motion';
export type PfTheme = 'light' | 'system' | 'dark';

const PF_PREFS_EVENT = 'hfr:pf-prefs';

function emitPrefsChanged(): void {
  window.dispatchEvent(new Event(PF_PREFS_EVENT));
}

function subscribePrefs(onChange: () => void): () => void {
  window.addEventListener(PF_PREFS_EVENT, onChange);
  window.addEventListener('storage', onChange);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(PF_PREFS_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    mq.removeEventListener('change', onChange);
  };
}

function readTheme(): PfTheme {
  const stored = localStorage.getItem(PF_THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function readMotionReduced(): boolean {
  return localStorage.getItem(PF_MOTION_KEY) === 'reduced';
}

function readResolvedDark(): boolean {
  return document.documentElement.dataset.pfTheme === 'dark';
}

function applyTheme(next: PfTheme): void {
  const dark =
    next === 'dark' ||
    (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.pfTheme = dark ? 'dark' : 'light';
}

function applyMotion(reduced: boolean): void {
  if (reduced) document.documentElement.dataset.pfMotion = 'reduced';
  else delete document.documentElement.dataset.pfMotion;
}

/**
 * Inlined by the platform layout ahead of the shell. Kept as a plain
 * string (not a module) so it survives RSC serialization untouched and
 * runs before the console paints. It must never throw: a broken
 * localStorage (private mode quota, disabled storage) degrades to the
 * default light register, not to a broken page.
 */
export const PF_THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('${PF_THEME_KEY}');
if(t!=='light'&&t!=='dark'&&t!=='system')t='system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.dataset.pfTheme=d?'dark':'light';
var m=localStorage.getItem('${PF_MOTION_KEY}');
if(m==='reduced')document.documentElement.dataset.pfMotion='reduced';
}catch(e){}})();`;

/** The three-way control on the Settings page: Light · System · Dark. */
export function PlatformThemeSwitch() {
  const choice = useSyncExternalStore(subscribePrefs, readTheme, () => 'system' as PfTheme);

  // Under "system", follow the OS while the page is open (no state to
  // mirror: the listener just re-applies to <html>).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readTheme() === 'system') applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  function pick(next: PfTheme) {
    localStorage.setItem(PF_THEME_KEY, next);
    applyTheme(next);
    emitPrefsChanged();
  }

  const options: Array<{ value: PfTheme; label: string; icon: React.ReactNode }> = [
    { value: 'light', label: 'Light', icon: <Icon.sun size={15} /> },
    { value: 'system', label: 'System', icon: <Icon.monitor size={15} /> },
    { value: 'dark', label: 'Dark', icon: <Icon.moon size={15} /> },
  ];

  return (
    <div className="pf-theme-switch" role="radiogroup" aria-label="Dashboard theme">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          className={`pf-theme-option${choice === o.value ? ' is-active' : ''}`}
          onClick={() => pick(o.value)}
        >
          {o.icon}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/** The reduce-motion control on the Settings page. */
export function PlatformMotionSwitch() {
  const reduced = useSyncExternalStore(subscribePrefs, readMotionReduced, () => false);

  function toggle() {
    const next = !reduced;
    localStorage.setItem(PF_MOTION_KEY, next ? 'reduced' : 'full');
    applyMotion(next);
    emitPrefsChanged();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={reduced}
      className={`pf-switch${reduced ? ' is-on' : ''}`}
      onClick={toggle}
    >
      <span className="pf-switch-track" aria-hidden="true">
        <span className="pf-switch-thumb" />
      </span>
      <span>{reduced ? 'Reduced motion on' : 'Full motion'}</span>
    </button>
  );
}

/**
 * The one-glyph toggle in the sidebar footer: resolves the CURRENT theme
 * (system-aware) and flips to the explicit opposite, so one click always
 * lands on a concrete register.
 */
export function PlatformThemeQuickToggle() {
  const dark = useSyncExternalStore(subscribePrefs, readResolvedDark, () => false);

  function flip() {
    const next: PfTheme = dark ? 'light' : 'dark';
    localStorage.setItem(PF_THEME_KEY, next);
    applyTheme(next);
    emitPrefsChanged();
  }

  return (
    <button
      type="button"
      className="pf-quick-theme"
      onClick={flip}
      title={dark ? 'Switch the dashboard to light' : 'Switch the dashboard to dark'}
      aria-label={dark ? 'Switch the dashboard to light' : 'Switch the dashboard to dark'}
    >
      {dark ? <Icon.sun size={16} /> : <Icon.moon size={16} />}
    </button>
  );
}
