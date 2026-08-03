import { Platform, useColorScheme } from 'react-native';

/**
 * ── The brand palette, measured from the logo ──
 * `_legacy/public/House For Rent App Logo.png` was decoded and its pixels
 * counted rather than eyeballed. The three brand hues, by frequency:
 *
 *   green  #0A5514  — the "RENT" wordmark and the ground line
 *   red    #CB0108  — the roof stripe and the rule under "FOR"
 *   ink    #080808  — the "HOUSE" wordmark and the house outline
 *
 * ── Why green leads and red accents ──
 * In the logo the green carries the wordmark and the ground; the red is a
 * stripe across the top. Making red the primary button colour would invert
 * that relationship, and — more practically — red reads as danger in a UI
 * that moves money. Green is the primary action; red is reserved for the
 * brand mark, selected states in the logo lockup, and genuine destructive
 * warnings.
 *
 * ── Why these steps and not the raw hex everywhere ──
 * `#0A5514` at 4.5:1 on white is fine for buttons and headings but too dark
 * to read as a tint; `#CB0108` fails contrast on the dark surface. Each has
 * a lighter/darker sibling below chosen to clear 4.5:1 against the surface
 * it actually sits on.
 */

const brand = {
  green: '#0A5514',
  greenDeep: '#073C0E',
  greenLift: '#127A1E',
  greenBright: '#3FB24E',
  red: '#CB0108',
  redSoft: '#E8555B',
  ink: '#080808',
} as const;

/**
 * Widened to `string` so the dark scheme below is free to differ. Without
 * this, `typeof light` infers each value as its own literal type and the
 * dark palette cannot supply a different hex for the same slot.
 */
type PaletteShape = Record<string, string>;

const light = {
  /** Text */
  ink: '#0E1211',
  inkSoft: '#5B6470',
  inkFaint: '#8A929C',

  /** Surfaces — the reference uses a soft off-white page with white cards. */
  bg: '#F6F7F5',
  surface: '#FFFFFF',
  surfaceAlt: '#EFF1EE',
  line: '#E2E6E1',

  /** Brand */
  brand: brand.green,
  brandInk: '#FFFFFF',
  brandSoft: '#E8F1E9',
  brandDeep: brand.greenDeep,
  accent: brand.red,
  accentSoft: '#FCEAEB',

  /** Status. Fixed roles, always paired with a text label. */
  ok: brand.green,
  okBg: '#E8F1E9',
  warn: '#8A5A00',
  warnBg: '#FDF6E7',
  danger: '#A4131A',
  dangerBg: '#FCEAEB',

  /** Chrome */
  shadow: '#0E1211',
  skeleton: '#E6E9E5',
} satisfies PaletteShape;

const dark: Record<keyof typeof light, string> = {
  ink: '#ECEFEA',
  inkSoft: '#9BA5A0',
  inkFaint: '#6C7570',

  bg: '#0D110E',
  surface: '#151A16',
  surfaceAlt: '#1D231F',
  line: '#2A322C',

  // The logo green is too dark to read on a dark surface; this is the same
  // hue lifted until it clears 4.5:1 against #151A16.
  brand: brand.greenBright,
  brandInk: '#05140A',
  brandSoft: '#14301A',
  brandDeep: brand.greenLift,
  accent: brand.redSoft,
  accentSoft: '#2C1517',

  ok: brand.greenBright,
  okBg: '#14301A',
  warn: '#E8C07A',
  warnBg: '#2A2213',
  danger: brand.redSoft,
  dangerBg: '#2C1517',

  shadow: '#000000',
  skeleton: '#1E241F',
};

export type Palette = Record<keyof typeof light, string>;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

/** The raw logo hues, for the wordmark lockup only. */
export const BRAND = brand;

/** A 4px base scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * The reference uses generous, fully-rounded shapes: pill filter chips,
 * ~16px cards, ~28px primary buttons.
 */
export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const font = {
  /**
   * System stack, deliberately. NFR-5 puts this app on mid-range Android
   * over a weak connection, and a webfont costs a download and a layout
   * shift on every cold start. The logo's geometric sans is matched in
   * WEIGHT and letter-spacing below rather than by shipping the typeface.
   */
  family: Platform.select({ ios: 'System', default: 'sans-serif' }),
  familyMedium: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),

  display: 30,
  hero: 26,
  title: 22,
  heading: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** The logo wordmark is tightly tracked, all-caps. Mirrored on headings. */
export const tracking = {
  display: -0.6,
  title: -0.4,
  wordmark: 2.4,
  label: 0.4,
} as const;

/** Soft elevation — the reference cards float on a tinted page. */
export const elevation = {
  card: {
    shadowColor: '#0E1211',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#0E1211',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
} as const;

/** Android's minimum comfortable touch target. */
export const TOUCH_TARGET = 48;
