import { useColorScheme, type TextStyle } from 'react-native';

/**
 * ── The House For Rent design language ──
 *
 * Implemented from the brand reference board: a near-black product surface,
 * one green carrying trust and action, Poppins, and thin-line iconography.
 * The board names its own design feel — trustworthy, professional, modern,
 * clean, human — and the job of these tokens is to make those the default
 * rather than something each screen has to remember.
 *
 * ── Dark is the designed-for theme, not the fallback ──
 * The reference draws the product on #0E1412. That is a deliberate identity
 * choice and not a preference toggle: a near-black page is what lets
 * property photography carry the screen, which is the whole point of a
 * discovery product. Light is implemented as a real counterpart for anyone
 * whose phone asks for it, but dark is what the product looks like.
 */

/* ── colour ──────────────────────────────────────────────────────────── */

/**
 * The five brand colours, straight off the reference board.
 *
 * ── Why there are two greens ──
 * The board specifies one, #16A34A, and it is correct everywhere it is used
 * AS A MARK: a verified pill, a price, a line of accent text on the dark
 * surface, where it clears 5:1 against #0E1412.
 *
 * It is not correct as a button FILL. White text on #16A34A measures
 * 3.29:1, which fails WCAG AA for anything short of large text, and a
 * primary button is the one control a user must never mis-read. `action`
 * is the same hue taken down one step to 5.02:1 with white. At a glance the
 * two are indistinguishable; under a contrast checker only one of them
 * passes, and the buttons in this product move money.
 */
const brand = {
  /** The board's near-black. The product surface. */
  ink: '#0E1412',
  /** The board's green. Verified marks, prices, accent text. */
  green: '#16A34A',
  /** The same green, dark enough to carry white button text at 5:1. */
  action: '#15803D',
  /** The board's off-white. */
  paper: '#F8FAFC',
  /** The board's neutral. */
  grey: '#67707A',
  /** The board's amber. Pending and awaiting states — never decoration. */
  amber: '#F59E0B',
  /** Amber is 2.1:1 on white, so light mode gets a darker step for text. */
  amberInk: '#B45309',
  red: '#DC2626',
  redBright: '#F87171',
} as const;

type PaletteShape = Record<string, string>;

/**
 * The product as the reference draws it.
 *
 * Three surface steps, not one: the page (#0E1412), the card lifted off it
 * (#171D1B), and the input/inert step below the card (#1F2624). A single
 * flat black with borders everywhere reads as a wireframe; the steps are
 * what make it read as a surface with things resting on it.
 */
const dark = {
  /** Text */
  ink: '#F8FAFC',
  inkSoft: '#A8B0AE',
  inkFaint: '#67707A',

  /** Surfaces */
  bg: '#0E1412',
  surface: '#171D1B',
  surfaceAlt: '#1F2624',
  surfaceInput: '#1F2624',
  line: '#28302E',
  lineStrong: '#3A4340',

  /** Brand */
  brand: brand.green,
  brandInk: '#FFFFFF',
  brandSoft: 'rgba(22,163,74,0.14)',
  /** Verified marks. The board's green, unmodified. */
  verified: brand.green,
  verifiedInk: '#FFFFFF',

  /** Status. Fixed roles, always paired with a text label. */
  ok: brand.green,
  okBg: 'rgba(22,163,74,0.14)',
  warn: brand.amber,
  warnBg: 'rgba(245,158,11,0.14)',
  danger: brand.redBright,
  dangerBg: 'rgba(220,38,38,0.16)',

  /** Chrome */
  skeleton: '#1F2624',
  scrim: 'rgba(0,0,0,0.6)',
} satisfies PaletteShape;

/**
 * The light counterpart. Every role keeps its job; the values are re-derived
 * against a white page rather than inverted, because an inverted dark theme
 * produces greys that are correct in ratio and wrong in feel.
 */
const light: Record<keyof typeof dark, string> = {
  ink: brand.ink,
  inkSoft: '#4A5350',
  inkFaint: brand.grey,

  bg: brand.paper,
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1F4',
  surfaceInput: '#F1F4F7',
  line: '#E2E7EB',
  lineStrong: '#CBD3D8',

  brand: brand.action,
  brandInk: '#FFFFFF',
  brandSoft: 'rgba(22,163,74,0.10)',
  verified: brand.action,
  verifiedInk: '#FFFFFF',

  ok: brand.action,
  okBg: 'rgba(22,163,74,0.10)',
  warn: brand.amberInk,
  warnBg: 'rgba(245,158,11,0.14)',
  danger: brand.red,
  dangerBg: 'rgba(220,38,38,0.10)',

  skeleton: '#E6EAEE',
  scrim: 'rgba(14,20,18,0.5)',
};

export type Palette = Record<keyof typeof dark, string>;

/**
 * Dark unless the phone explicitly asks for light.
 *
 * `useColorScheme()` returns null when the platform has no preference, and
 * the product's designed appearance is the right answer to "no preference"
 * — so only an explicit `'light'` switches.
 */
export function usePalette(): Palette {
  return useColorScheme() === 'light' ? light : dark;
}

export function useIsDark(): boolean {
  return useColorScheme() !== 'light';
}

export const BRAND = brand;

/* ── type ────────────────────────────────────────────────────────────── */

/**
 * Poppins, bundled as the reference's three weights.
 *
 * A webfont over a Ugandan mobile connection costs a download and a layout
 * shift on every cold start (NFR-5). ~150KB per weight ships inside the
 * binary instead, so the first frame is already correct.
 *
 * ── Why weights are families, not `fontWeight` ──
 * Android does not synthesise weights for custom fonts: setting
 * `fontWeight: '600'` on a family with no semibold face silently renders
 * regular. Each weight is its own family name, and nothing in this app sets
 * `fontWeight` on Poppins.
 */
export const fontFamily = {
  regular: 'Poppins-400',
  medium: 'Poppins-500',
  semibold: 'Poppins-600',
} as const;

/** The files `expo-font` loads at startup, keyed by the names above. */
export const FONT_ASSETS = {
  [fontFamily.regular]: require('@/assets/fonts/Poppins-400.ttf'),
  [fontFamily.medium]: require('@/assets/fonts/Poppins-500.ttf'),
  [fontFamily.semibold]: require('@/assets/fonts/Poppins-600.ttf'),
};

/**
 * The type scale, as finished style objects.
 *
 * Screens compose these rather than assembling a size and a weight
 * themselves — a literal `fontSize` anywhere in the app is a step nobody
 * agreed to, and two of those are what make an interface look assembled
 * rather than designed.
 *
 * Poppins runs large for its point size and its ascenders are tall, so the
 * line heights here are looser than the previous face needed. Display is
 * capped at 30: the reference's headline wraps to three lines on a phone,
 * and it is meant to.
 */
export const type = {
  displayLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 30,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  headlineLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  headlineMd: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  headlineSm: {
    fontFamily: fontFamily.semibold,
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: -0.1,
  },
  bodyLg: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 26,
  },
  bodyMd: {
    fontFamily: fontFamily.regular,
    fontSize: 15,
    lineHeight: 23,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  labelLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 15,
    lineHeight: 22,
  },
  labelMd: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  /**
   * The one all-caps step — verified pills and nothing else.
   * §4 of the directive: avoid excessive uppercase.
   */
  labelSm: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.6,
  },
} satisfies Record<string, TextStyle>;

/* ── space & shape ───────────────────────────────────────────────────── */

/** A 4px baseline. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  gutter: 16,
  /** The safe margin on every screen edge. */
  screen: 20,
  lg: 24,
  xl: 32,
  section: 48,
} as const;

/**
 * "Subtle radius" (§7). Four steps, named for what they wrap.
 *
 * The reference's cards and buttons sit around 12–14px — rounded enough to
 * read as modern, short of the fully-pilled shapes that make an interface
 * look like a toy.
 */
export const radius = {
  /** Chips, tags, small utility surfaces. */
  chip: 10,
  /** The standard: cards, buttons, inputs, and all property imagery. */
  control: 14,
  /** Bottom sheets and modals. */
  sheet: 24,
  pill: 999,
} as const;

/**
 * Minimal elevation (§7).
 *
 * On the dark theme a drop shadow is invisible, so cards are separated by
 * the surface step instead — `surface` sits above `bg` by design. This
 * shadow therefore only ever applies on light, where the page is white and
 * a card needs an edge. `useCardSurface()` in `components/ui.tsx` picks.
 */
export const shadow = {
  shadowColor: '#0E1412',
  shadowOpacity: 0.06,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/**
 * Motion (§10) — "fast first and animated second".
 *
 * Built on React Native's own `Animated`, with no animation library: every
 * movement in this product is an opacity or a transform, both of which run
 * on the native driver, and a dependency for that would be weight on a
 * mid-range Android for nothing.
 */
export const motion = {
  /** Press feedback, chip selection. */
  instant: 120,
  /** The default: fades, sheet transitions. */
  quick: 200,
  /** Image reveal, where a slower fade reads as the photo arriving. */
  settle: 320,
} as const;

/** Android's minimum comfortable touch target. */
export const TOUCH_TARGET = 48;
