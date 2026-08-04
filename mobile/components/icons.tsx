import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, type SvgProps } from 'react-native-svg';
import { usePalette } from '@/lib/theme';

/**
 * The icon set.
 *
 * ── Why these are drawn here and not installed ──
 * The design reference draws its icons from Material Symbols, which is an
 * icon FONT: ~200KB of glyphs downloaded so that a dozen of them can be
 * shown, on a connection NFR-5 says to spend carefully. These are the
 * twelve the product actually uses, as inline paths — a few hundred bytes
 * of JavaScript inside the bundle, no network request, and no risk of the
 * tofu box that an unloaded glyph leaves behind.
 *
 * ── Why they are stroked, not filled ──
 * A 1.75px stroke at 24px matches the weight of Hanken Grotesk's semibold
 * at label sizes, so an icon beside a word looks like it belongs to the
 * same alphabet. `Verified` is the deliberate exception: it is filled,
 * because it is a badge rather than a label, and it has to hold up at 14px
 * on top of a photograph.
 *
 * ── The rule for using one ──
 * An icon goes in only where it carries meaning the adjacent text does not,
 * or where there is no room for text at all. An icon that restates its own
 * label is decoration, and this product had a set of those once already.
 */

export interface IconProps {
  size?: number;
  /**
   * `ColorValue`, not `string`: React Navigation hands the tab bar's icon
   * renderer the platform's own colour representation, which on Android can
   * be an opaque handle rather than a hex string.
   */
  color?: ColorValue;
  /** Screen-reader name. Omit when the icon sits beside its own label. */
  label?: string;
}

function Icon({
  size = 24,
  color,
  label,
  children,
  filled,
  ...rest
}: IconProps & { children: React.ReactNode; filled?: boolean } & SvgProps) {
  const p = usePalette();
  const stroke = color ?? p.inkSoft;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={filled ? 'none' : stroke}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      // Without a label the icon is decorative beside real text, and a
      // screen reader announcing it would just repeat that text.
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      {...rest}
    >
      {children}
    </Svg>
  );
}

/* ── navigation ──────────────────────────────────────────────────────── */

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx="11" cy="11" r="7" />
      <Path d="M20 20l-3.9-3.9" />
    </Icon>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M3 10.2 12 3.5l9 6.7" />
      <Path d="M5.5 9v10.5h13V9" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M4.5 6.5h15v13h-15z" />
      <Path d="M4.5 10.5h15M8.5 4v4M15.5 4v4" />
    </Icon>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="8.5" r="3.75" />
      <Path d="M4.75 20c.9-3.6 3.8-5.5 7.25-5.5s6.35 1.9 7.25 5.5" />
    </Icon>
  );
}

/* ── trust ───────────────────────────────────────────────────────────── */

/**
 * The verified badge mark. Filled, because it sits on photography.
 */
export function VerifiedIcon({ size = 16, color, label }: IconProps) {
  const p = usePalette();
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Circle cx="12" cy="12" r="10" fill={color ?? p.verified} />
      <Path
        d="M7.5 12.4l3 3 6-6.4"
        fill="none"
        stroke={p.verifiedInk}
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The escrow / guarantee mark. */
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M12 3.25l7 2.6v5.4c0 4.35-2.85 7.6-7 9.5-4.15-1.9-7-5.15-7-9.5v-5.4z" />
      <Path d="M8.75 12.1l2.35 2.35 4.15-4.5" />
    </Icon>
  );
}

/** Freshness — "confirmed 2 days ago". */
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Circle cx="12" cy="12" r="8.5" />
      <Path d="M12 7.25V12l3 1.75" />
    </Icon>
  );
}

/* ── property attributes ─────────────────────────────────────────────── */

export function BedIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M3.25 18.5v-11M3.25 12.5h17.5v6M20.75 18.5v-3" />
      <Path d="M6.5 12.5v-2.25h5.25v2.25" />
    </Icon>
  );
}

export function BathIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M3.5 12.5h17v2a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4z" />
      <Path d="M6.5 12.5V6.25A2.25 2.25 0 0 1 8.75 4c1.15 0 2 .8 2.15 1.9" />
      <Path d="M7 21l-1 1.25M17 21l1 1.25" />
    </Icon>
  );
}

/** Location — the neighbourhood line. */
export function PinIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M12 21.5c4-4.35 6-7.75 6-10.4a6 6 0 1 0-12 0c0 2.65 2 6.05 6 10.4z" />
      <Circle cx="12" cy="11" r="2.25" />
    </Icon>
  );
}

/* ── controls ────────────────────────────────────────────────────────── */

export function FilterIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M4 7.5h16M7 12h10M10 16.5h4" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M9.5 5.5l7 6.5-7 6.5" />
    </Icon>
  );
}

export function ArrowLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M19 12H5.5M11 5.5L4.5 12l6.5 6.5" />
    </Icon>
  );
}

/** The photo slot's mark, shown only where no photograph exists yet. */
export function ImageIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <Path d="M4 5.5h16v13H4z" />
      <Circle cx="9" cy="10" r="1.5" />
      <Path d="M4 16l4.5-4 3.5 3 3-2.5 5 4.5" />
    </Icon>
  );
}
