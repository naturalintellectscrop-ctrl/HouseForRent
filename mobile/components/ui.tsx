import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  BRAND,
  elevation,
  font,
  radius,
  space,
  TOUCH_TARGET,
  tracking,
  useIsDark,
  usePalette,
} from '@/lib/theme';

/**
 * The primitive set, built to the reference design: a tinted page with
 * white floating cards, pill filter chips, rounded inputs with leading
 * glyphs, and a fully-rounded primary button.
 *
 * Hand-built rather than pulled from a UI kit — this ships to mid-range
 * Android over a weak connection (NFR-5), and a component library would add
 * megabytes to render lists, cards and forms.
 */

/* ── layout ─────────────────────────────────────────────────────────── */

export function Screen({
  children,
  style,
  scroll,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  scroll?: boolean;
}) {
  const p = usePalette();
  const inner = (
    <View style={[{ padding: space.lg, flexGrow: 1 }, style]}>{children}</View>
  );

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: p.bg }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: space.xxxl }}
        keyboardShouldPersistTaps="handled"
      >
        {inner}
      </ScrollView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: p.bg }}>{inner}</View>;
}

/* ── the wordmark ───────────────────────────────────────────────────── */

/**
 * The House For Rent mark.
 *
 * The real logo, cropped to its content and downscaled to 512px with box
 * averaging — nearest-neighbour aliased the thin red roof stripe badly at
 * small sizes. Transparent background so it sits on either surface.
 *
 * ── Why a `tint` variant exists ──
 * The mark's "HOUSE" wordmark and house outline are near-black (#080808),
 * which vanishes on the dark surface. Rather than ship a second artwork
 * that could drift from the first, `onDark` renders the same asset over a
 * light plate — the mark is always the real mark, and the plate is what
 * changes.
 */
export function Wordmark({
  size = 'md',
  onDark,
}: {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
}) {
  const px = size === 'lg' ? 168 : size === 'sm' ? 88 : 124;
  const dark = useIsDark();
  const needsPlate = onDark ?? dark;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="House For Rent"
      style={
        needsPlate
          ? {
              backgroundColor: '#FFFFFF',
              borderRadius: radius.md,
              padding: space.md,
            }
          : undefined
      }
    >
      {/* React Native's own Image, not expo-image: this is one bundled
          static asset with no remote loading, caching or placeholder
          needs, so the extra dependency would buy nothing and cost bundle
          size (NFR-5). */}
      <Image
        source={require('@/assets/logo.png')}
        style={{ width: px, height: px }}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}

/* ── type ───────────────────────────────────────────────────────────── */

export function Display({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontSize: font.display,
        fontWeight: '800',
        color: p.ink,
        letterSpacing: tracking.display,
        lineHeight: font.display * 1.2,
      }}
    >
      {children}
    </Text>
  );
}

export function Title({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontSize: font.title,
        fontWeight: '800',
        color: p.ink,
        letterSpacing: tracking.title,
        marginBottom: space.xs,
      }}
    >
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontSize: font.heading,
        fontWeight: '700',
        color: p.ink,
        marginTop: space.xl,
        marginBottom: space.md,
      }}
    >
      {children}
    </Text>
  );
}

/** An all-caps eyebrow, as above the reference's headline. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text
      style={{
        fontSize: font.tiny,
        fontWeight: '700',
        color: p.inkFaint,
        letterSpacing: tracking.wordmark,
        textTransform: 'uppercase',
        marginBottom: space.sm,
      }}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  faint,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  faint?: boolean;
  style?: TextStyle;
}) {
  const p = usePalette();
  return (
    <Text
      style={[
        {
          fontSize: muted || faint ? font.small : font.body,
          color: faint ? p.inkFaint : muted ? p.inkSoft : p.ink,
          lineHeight: muted || faint ? 19 : 22,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** The price, as the reference renders it: brand-coloured and prominent. */
export function Price({
  amount,
  per,
  size = 'md',
}: {
  amount: string;
  per?: string;
  size?: 'md' | 'lg';
}) {
  const p = usePalette();
  return (
    <Text>
      <Text
        style={{
          fontSize: size === 'lg' ? font.hero : font.heading,
          fontWeight: '800',
          color: p.brand,
          letterSpacing: tracking.title,
        }}
      >
        {amount}
      </Text>
      {per ? (
        <Text style={{ fontSize: font.small, color: p.inkSoft }}> {per}</Text>
      ) : null}
    </Text>
  );
}

/* ── containers ─────────────────────────────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
  flat,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  flat?: boolean;
}) {
  const p = usePalette();
  const base: ViewStyle = {
    backgroundColor: p.surface,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.md,
    ...(flat ? { borderWidth: 1, borderColor: p.line } : elevation.card),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * A pill filter row, as in the reference's Favorites screen: the selected
 * chip fills with brand colour, the rest sit on a tinted surface.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const p = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: space.sm, paddingVertical: space.xs }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              minHeight: 40,
              justifyContent: 'center',
              paddingHorizontal: space.lg,
              borderRadius: radius.pill,
              backgroundColor: selected ? p.brand : p.surfaceAlt,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={{
                color: selected ? p.brandInk : p.inkSoft,
                fontSize: font.small,
                fontWeight: '700',
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export type PillTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';

/**
 * A label with a tint. The TEXT always carries the meaning — tone is never
 * the only signal, so it survives colour-vision deficiency and greyscale.
 */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: PillTone;
}) {
  const p = usePalette();
  const tones: Record<PillTone, { bg: string; fg: string }> = {
    neutral: { bg: p.surfaceAlt, fg: p.inkSoft },
    brand: { bg: p.brandSoft, fg: p.brand },
    ok: { bg: p.okBg, fg: p.ok },
    warn: { bg: p.warnBg, fg: p.warn },
    danger: { bg: p.dangerBg, fg: p.danger },
  };
  const { bg, fg } = tones[tone];

  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingHorizontal: space.md,
        paddingVertical: 5,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          color: fg,
          fontSize: font.tiny,
          fontWeight: '800',
          letterSpacing: tracking.label,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/* ── controls ───────────────────────────────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const p = usePalette();
  const inert = disabled || busy;

  const variants: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: p.brand, fg: p.brandInk, border: p.brand },
    outline: { bg: 'transparent', fg: p.brand, border: p.brand },
    ghost: { bg: p.surfaceAlt, fg: p.ink, border: 'transparent' },
    danger: { bg: 'transparent', fg: p.danger, border: p.line },
  };
  const v = variants[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!busy }}
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        {
          minHeight: 54,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: variant === 'ghost' ? 0 : 1.5,
          // Fully rounded, as the reference's Login / Sign Up buttons.
          borderRadius: radius.xl,
          paddingHorizontal: space.xl,
          opacity: inert ? 0.45 : pressed ? 0.88 : 1,
          marginBottom: space.md,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={{ color: v.fg, fontSize: font.body, fontWeight: '800' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A field with a leading glyph, matching the reference's inputs.
 *
 * The glyph is a text character rather than an icon font: five symbols do
 * not justify a typeface download on a field connection (NFR-5).
 */
export function Field({
  label,
  hint,
  glyph,
  trailing,
  error,
  ...props
}: TextInputProps & {
  label: string;
  hint?: string;
  glyph?: string;
  trailing?: React.ReactNode;
  error?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text
        style={{
          fontSize: font.small,
          fontWeight: '700',
          color: p.ink,
          marginBottom: space.sm,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 54,
          backgroundColor: p.surfaceAlt,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: error ? p.danger : 'transparent',
          paddingHorizontal: space.md,
        }}
      >
        {glyph ? (
          <Text
            style={{ color: p.inkFaint, fontSize: 16, marginRight: space.sm }}
          >
            {glyph}
          </Text>
        ) : null}
        <TextInput
          placeholderTextColor={p.inkFaint}
          {...props}
          style={{
            flex: 1,
            fontSize: font.body,
            color: p.ink,
            paddingVertical: space.md,
          }}
        />
        {trailing}
      </View>
      {hint ? (
        <Text
          style={{ fontSize: font.tiny, color: p.inkSoft, marginTop: space.xs }}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ── feedback ───────────────────────────────────────────────────────── */

export type AlertTone = 'error' | 'ok' | 'note';

/**
 * Shows a backend rejection with its code. The code is surfaced
 * deliberately: `TENANT_NOT_VERIFIED` and `ILLEGAL_TRANSITION` mean
 * different things to whoever the user calls for help, and flattening both
 * into "something went wrong" destroys the only diagnostic they have.
 */
export function Alert({
  tone = 'note',
  message,
  code,
}: {
  tone?: AlertTone;
  message: string;
  code?: string | null;
}) {
  const p = usePalette();
  const tones: Record<AlertTone, { bg: string; fg: string }> = {
    error: { bg: p.dangerBg, fg: p.danger },
    ok: { bg: p.okBg, fg: p.ok },
    note: { bg: p.surfaceAlt, fg: p.inkSoft },
  };
  const { bg, fg } = tones[tone];

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: bg,
        borderRadius: radius.sm,
        padding: space.md,
        marginBottom: space.md,
      }}
    >
      <Text style={{ color: fg, fontSize: font.small, lineHeight: 19 }}>
        {message}
        {code ? `  (${code})` : ''}
      </Text>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const p = usePalette();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={p.brand} />
      {label ? (
        <Text
          style={{
            color: p.inkSoft,
            marginTop: space.md,
            fontSize: font.small,
          }}
        >
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * An empty state. `message` comes from the SERVER wherever the server has
 * an opinion (FR-4.4) — a zero-result search must explain ongoing
 * verification rather than read as failure, and that copy is the server's.
 */
export function Empty({
  title,
  message,
  glyph = '⌂',
}: {
  title: string;
  message?: string | null;
  glyph?: string;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        backgroundColor: p.surface,
        borderRadius: radius.md,
        padding: space.xxl,
        alignItems: 'center',
        ...elevation.card,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.pill,
          backgroundColor: p.brandSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space.md,
        }}
      >
        <Text style={{ fontSize: 26, color: p.brand }}>{glyph}</Text>
      </View>
      <Text
        style={{
          fontWeight: '800',
          color: p.ink,
          fontSize: font.body,
          marginBottom: space.xs,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={{
            color: p.inkSoft,
            fontSize: font.small,
            textAlign: 'center',
            lineHeight: 19,
          }}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: space.md,
        paddingVertical: space.sm,
      }}
    >
      <Text style={{ color: p.inkSoft, fontSize: font.small, flexShrink: 0 }}>
        {label}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {typeof value === 'string' ? (
          <Text
            style={{
              color: p.ink,
              fontSize: font.small,
              fontWeight: strong ? '800' : '600',
              textAlign: 'right',
            }}
          >
            {value}
          </Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

export function Divider() {
  const p = usePalette();
  return <View style={{ height: 1, backgroundColor: p.line, marginVertical: space.sm }} />;
}

/**
 * A tinted placeholder block standing in for property photography.
 *
 * Real media exists behind `MediaStorageProvider`, but V1's provider is a
 * mock and no bytes are served yet — so this renders an honest placeholder
 * rather than a broken image or a stock photo of a house that is not the
 * one being listed.
 */
export function PhotoPlaceholder({
  size = 84,
  glyph = '⌂',
  radius: r = radius.sm,
}: {
  size?: number;
  glyph?: string;
  radius?: number;
}) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Photo not yet available"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        backgroundColor: p.brandSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.34, color: p.brand }}>{glyph}</Text>
    </View>
  );
}
