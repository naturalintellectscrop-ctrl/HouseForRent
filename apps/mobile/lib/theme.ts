import { useColorScheme, type TextStyle } from 'react-native';

/**
 * ── The design system: "Ugandan Rental Essence" ──
 *
 * Implemented from the Stitch design reference packs, whose own spec is at
 * `docs/design-reference/stitch/01-tenant-discovery/ugandan_rental_essence/DESIGN.md`.
 * The reference shipped a second system alongside it ("Azure Property"),
 * built on a #0053ce blue with Plus Jakarta Sans, and it is deliberately
 * NOT implemented here: blue is not this company's colour, and the screens
 * drawn in it are a re-skin of a generic real-estate template — one of them
 * is still captioned "Welcome to Real Scout" and offers Google sign-in,
 * which this product cannot use because accounts are keyed to a Ugandan
 * MSISDN and NIN.
 *
 * ── Why this palette is trustworthy ──
 * The reference's `primary-container` is #0a5514, which is the exact green
 * measured out of the House For Rent logo when this app was first built.
 * The system was drawn for this brand rather than adapted to it.
 */

/* ── colour ──────────────────────────────────────────────────────────── */

/**
 * The brand hues, measured from the logo artwork.
 *
 * Green leads and red accents: in the mark, green carries the wordmark and
 * the ground line while red is a stripe across the roof. Making red primary
 * would invert that, and — more practically — red reads as danger in a UI
 * that moves money. The design system agrees, and is blunt about it: the
 * accent red is "strictly forbidden for decoration or emphasis; it is used
 * exclusively for genuine error states".
 */
const brand = {
  /** Button fill. The reference's `primary` — deeper than the logo green. */
  forest: '#003C08',
  /** The logo green. The reference's `primary-container`; verified badges. */
  green: '#0A5514',
  /** Lifted for legibility on the dark surface. */
  greenBright: '#5FBF57',
  greenSoft: '#81C97A',
  red: '#BA1A1A',
  redSoft: '#E8555B',
} as const;

type PaletteShape = Record<string, string>;

/**
 * The reference's two-tier surface model: a warm off-white page with pure
 * white cards floating on it. The warmth is the point — the spec calls it
 * "more domestic and inviting than a sterile pure white", and it is what
 * stops a screen full of property photography reading like a spreadsheet.
 */
const light = {
  /** Text */
  ink: '#1C1B1B',
  inkSoft: '#41493E',
  inkFaint: '#717A6C',

  /** Surfaces */
  bg: '#FCF8F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F0EDEC',
  /** Inputs and inert chips sit a step down from a card. */
  surfaceInput: '#F6F3F2',
  line: '#E5E2E1',
  lineStrong: '#C0C9BA',

  /** Brand */
  brand: brand.forest,
  brandInk: '#FFFFFF',
  brandSoft: '#E8F1E9',
  /** Verified badges — the logo green, not the deeper button green. */
  verified: brand.green,
  verifiedInk: '#FFFFFF',

  /** Status. Fixed roles, always paired with a text label. */
  ok: brand.green,
  okBg: '#E8F1E9',
  warn: '#8A5A00',
  warnBg: '#FDF6E7',
  danger: brand.red,
  dangerBg: '#FFDAD6',

  /** Chrome */
  skeleton: '#EBE7E7',
  scrim: 'rgba(28,27,27,0.4)',
} satisfies PaletteShape;

/**
 * The reference is a light-only system. This is the dark counterpart,
 * derived rather than invented: every role keeps its job, and the greens
 * are lifted until they clear 4.5:1 on the surface they actually sit on —
 * #0A5514 on a near-black card is unreadable.
 */
const dark: Record<keyof typeof light, string> = {
  ink: '#ECEFEA',
  inkSoft: '#B4BCB2',
  inkFaint: '#8A938A',

  bg: '#111311',
  surface: '#191C19',
  surfaceAlt: '#232722',
  surfaceInput: '#232722',
  line: '#2E332D',
  lineStrong: '#414A40',

  brand: brand.greenBright,
  brandInk: '#04140A',
  brandSoft: '#16301A',
  verified: brand.greenBright,
  verifiedInk: '#04140A',

  ok: brand.greenBright,
  okBg: '#16301A',
  warn: '#E8C07A',
  warnBg: '#2A2213',
  danger: brand.redSoft,
  dangerBg: '#2C1517',

  skeleton: '#232722',
  scrim: 'rgba(0,0,0,0.55)',
};

export type Palette = Record<keyof typeof light, string>;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}

export const BRAND = brand;

/* ── type ────────────────────────────────────────────────────────────── */

/**
 * Hanken Grotesk, bundled as three static weights rather than fetched.
 *
 * A webfont over a Ugandan mobile connection costs a download and a layout
 * shift on every cold start (NFR-5). ~57KB per weight ships inside the
 * binary instead, so the first frame is already correct.
 *
 * ── Why weights are families, not `fontWeight` ──
 * Android does not synthesise weights for custom fonts: setting
 * `fontWeight: '700'` on a family that has no bold face silently renders
 * regular. Each weight is therefore its own family name, and nothing in
 * this app sets `fontWeight` on Hanken Grotesk.
 */
export const fontFamily = {
  regular: 'HankenGrotesk-400',
  semibold: 'HankenGrotesk-600',
  bold: 'HankenGrotesk-700',
} as const;

/** The files `expo-font` loads at startup, keyed by the names above. */
export const FONT_ASSETS = {
  [fontFamily.regular]: require('@/assets/fonts/HankenGrotesk-400.ttf'),
  [fontFamily.semibold]: require('@/assets/fonts/HankenGrotesk-600.ttf'),
  [fontFamily.bold]: require('@/assets/fonts/HankenGrotesk-700.ttf'),
};

/**
 * The type scale, as finished style objects.
 *
 * Screens compose these rather than assembling a size and a weight
 * themselves — a literal `fontSize` anywhere in the app is a step nobody
 * agreed to, and two of those are what make an interface look assembled
 * rather than designed.
 *
 * `displayLg` is the reference's 40px headline at its documented mobile
 * size: the spec says to scale it to 32 on phones "to prevent awkward word
 * wrapping", and this app is only ever a phone.
 */
export const type = {
  displayLg: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.64,
  },
  headlineLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.4,
  },
  headlineMd: {
    fontFamily: fontFamily.semibold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.24,
  },
  headlineSm: {
    fontFamily: fontFamily.semibold,
    fontSize: 20,
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  bodyLg: {
    fontFamily: fontFamily.regular,
    fontSize: 18,
    lineHeight: 28,
  },
  bodyMd: {
    fontFamily: fontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  labelLg: {
    fontFamily: fontFamily.semibold,
    fontSize: 16,
    lineHeight: 24,
  },
  labelMd: {
    fontFamily: fontFamily.semibold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.14,
  },
  /** All-caps micro label — verified pills, eyebrows, table headers. */
  labelSm: {
    fontFamily: fontFamily.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
} satisfies Record<string, TextStyle>;

/* ── space & shape ───────────────────────────────────────────────────── */

/** The reference's 4px baseline, under its own names. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  gutter: 16,
  /** The 20px safe margin the spec puts on every screen edge. */
  screen: 20,
  lg: 24,
  xl: 32,
  section: 48,
} as const;

/**
 * "Rounded — a balance between the efficiency of a square and the
 * friendliness of a circle." Four steps, named for what they wrap.
 */
export const radius = {
  /** Chips, tags, small utility surfaces. */
  chip: 8,
  /** The standard: cards, buttons, inputs, and all property imagery — the
      spec is explicit that photos carry the same radius as the containers
      around them, so an image never reads as a foreign object. */
  control: 12,
  /** Bottom sheets and modals. */
  sheet: 24,
  pill: 999,
} as const;

/**
 * One shadow, extra-diffused, exactly as specified.
 *
 * It is applied on the light theme only. On the dark surface a 5%-opacity
 * drop shadow is invisible, so cards there take a hairline border instead —
 * see `useCardSurface`. Depth that only exists in one theme is worse than
 * no depth at all, because the component then reads as two components.
 */
export const shadow = {
  shadowColor: '#0A0A0A',
  shadowOpacity: 0.05,
  shadowRadius: 20,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

/**
 * Motion.
 *
 * Built on React Native's own `Animated`, with no animation library: every
 * movement in this product is an opacity or a transform, all of which run
 * on the native driver, and a dependency for that would be weight on a
 * mid-range Android for nothing.
 *
 * The durations are short on purpose. Motion here exists to explain a
 * change — a photo arriving, a sheet opening, a press registering — and
 * anything an operator has to wait through is a cost, not polish.
 */
export const motion = {
  /** Press feedback, chip selection. */
  instant: 120,
  /** The default: fades, sheet transitions. */
  quick: 200,
  /** Image reveal, where a slower fade reads as the photo "developing". */
  settle: 320,
} as const;

/** Android's minimum comfortable touch target. */
export const TOUCH_TARGET = 48;
