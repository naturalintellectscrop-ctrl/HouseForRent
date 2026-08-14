import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  motion,
  radius,
  shadow,
  space,
  type as t,
  useIsDark,
  usePalette,
  type Palette,
} from '@/lib/theme';
import { CheckIcon, ImageIcon } from '@/components/icons';

/**
 * The primitive set, built to the "Ugandan Rental Essence" reference.
 *
 * ── One answer per question ──
 * There is one card, one button in four tones, one input, one status label.
 * Where the reference drew a pattern twice in two shapes, the shape that
 * survives both themes is the one implemented.
 *
 * ── Hand-built ──
 * No UI kit. This ships to mid-range Android over a weak connection
 * (NFR-5), and a component library would add megabytes to render lists,
 * cards and forms.
 */

/**
 * The top inset a tab screen must leave for the status bar.
 *
 * The tab screens render their own title instead of a navigator header, so
 * nothing above them is reserving that space any more — without this the
 * headline sits underneath the clock and the battery icon.
 */
export function useTopInset(): number {
  return useSafeAreaInsets().top;
}

/* ── surfaces ────────────────────────────────────────────────────────── */

/**
 * The card treatment, resolved per theme.
 *
 * The reference specifies an extra-diffused `0 4px 20px rgba(10,10,10,.05)`
 * on white cards over a warm off-white page, and that is exactly right on
 * light. On the dark surface the same shadow is invisible — so dark takes a
 * hairline border, which does the identical job of separating card from
 * page. The component reads the same in both; only the mechanism differs.
 */
export function useCardSurface(): ViewStyle {
  const p = usePalette();
  const dark = useIsDark();
  return {
    backgroundColor: p.surface,
    borderRadius: radius.control,
    ...(dark ? { borderWidth: 1, borderColor: p.line } : shadow),
  };
}

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
    <View style={[{ padding: space.screen, flexGrow: 1 }, style]}>
      {children}
    </View>
  );

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: p.bg }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: space.section }}
        keyboardShouldPersistTaps="handled"
      >
        {inner}
      </ScrollView>
    );
  }
  return <View style={{ flex: 1, backgroundColor: p.bg }}>{inner}</View>;
}

/* ── the wordmark ────────────────────────────────────────────────────── */

/**
 * The House For Rent mark.
 *
 * The mark's "HOUSE" wordmark and house outline are near-black, which
 * vanishes on the dark surface. Rather than ship a second artwork that
 * could drift from the first, dark renders the same asset over a light
 * plate — the mark is always the real mark; the plate is what changes.
 */
export function Wordmark({
  size = 'md',
  onDark,
}: {
  size?: 'sm' | 'md' | 'lg';
  onDark?: boolean;
}) {
  const px = size === 'lg' ? 132 : size === 'sm' ? 72 : 100;
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
              borderRadius: radius.control,
              padding: space.md,
              // Sized to its contents, not to the parent. Without an
              // explicit width this View stretches to fill any container
              // that is not centring its children, which turned the plate
              // into a full-bleed white slab across the auth screens.
              width: px + space.md * 2,
              height: px + space.md * 2,
              alignItems: 'center',
              justifyContent: 'center',
            }
          : undefined
      }
    >
      <Image
        source={require('@/assets/logo.png')}
        style={{ width: px, height: px }}
        resizeMode="contain"
        accessible={false}
      />
    </View>
  );
}

/* ── type ────────────────────────────────────────────────────────────── */

type Tone = 'default' | 'muted' | 'faint' | 'brand' | 'danger';

function toneColor(p: Palette, tone: Tone): string {
  switch (tone) {
    case 'muted':
      return p.inkSoft;
    case 'faint':
      return p.inkFaint;
    case 'brand':
      return p.brand;
    case 'danger':
      return p.danger;
    default:
      return p.ink;
  }
}

function makeText(base: TextStyle, defaultTone: Tone = 'default') {
  return function Component({
    children,
    tone = defaultTone,
    style,
    numberOfLines,
  }: {
    children: React.ReactNode;
    tone?: Tone;
    style?: TextStyle;
    numberOfLines?: number;
  }) {
    const p = usePalette();
    return (
      <Text
        numberOfLines={numberOfLines}
        style={[base, { color: toneColor(p, tone) }, style]}
      >
        {children}
      </Text>
    );
  };
}

/** The one headline a screen leads with. */
export const Display = makeText(t.displayLg);
/** A screen title. */
export const Title = makeText(t.headlineMd);
/** A card or block title. */
export const Subtitle = makeText(t.headlineSm);
export const Body = makeText(t.bodyMd);
export const BodySm = makeText(t.bodySm, 'muted');
export const Label = makeText(t.labelMd);
/** All-caps micro label. */
export const Caption = makeText(t.labelSm, 'faint');

/**
 * A section heading, and the app's section rhythm.
 *
 * The space above a section belongs to the heading rather than to each
 * screen, so every section break in the product is the same distance.
 */
export function Heading({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text
      style={[
        t.headlineSm,
        { color: p.ink, marginTop: space.xl, marginBottom: space.gutter },
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * The price.
 *
 * The reference is firm that rent is rendered at headline weight and in the
 * brand green: on a card full of grey metadata it is the number a tenant is
 * actually scanning for, and the only element in the row that earns colour.
 */
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
        style={[
          size === 'lg' ? t.headlineLg : t.headlineSm,
          { color: p.brand },
        ]}
      >
        {amount}
      </Text>
      {per ? (
        <Text style={[t.bodySm, { color: p.inkSoft }]}> {per}</Text>
      ) : null}
    </Text>
  );
}

/* ── imagery ─────────────────────────────────────────────────────────── */

/**
 * The slot a property photograph occupies.
 *
 * ── On the honest empty frame ──
 * Every photograph on this platform is captured by a field officer through
 * `MediaStorageProvider`, and V1's provider is a mock that serves no bytes.
 * So when there is no `uri` this renders a quiet labelled frame. It does
 * NOT render a stock photograph of a house: on a product whose entire
 * proposition is that an officer stood in that room, an illustrative
 * stand-in is the one lie the interface cannot afford. The reference's own
 * screens are filled with generated houses, and that is the single thing in
 * them that must not ship.
 *
 * ── On the fade ──
 * When a real URI does arrive, the photo fades up over the skeleton rather
 * than snapping in. On a slow connection a hard swap reads as the layout
 * breaking; a 320ms fade reads as the picture developing. This is the
 * motion the reference asks for, and the only motion on the card.
 */
export function PropertyImage({
  uri,
  aspectRatio = 4 / 3,
  radius: r = radius.control,
  style,
  children,
}: {
  uri?: string | null;
  aspectRatio?: number;
  radius?: number;
  style?: ViewStyle;
  children?: React.ReactNode;
}) {
  const p = usePalette();
  const [loaded, setLoaded] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!loaded) return;
    Animated.timing(fade, {
      toValue: 1,
      duration: motion.settle,
      useNativeDriver: true,
    }).start();
  }, [loaded, fade]);

  return (
    <View
      style={[
        {
          width: '100%',
          aspectRatio,
          borderRadius: r,
          overflow: 'hidden',
          backgroundColor: uri ? p.skeleton : p.surfaceAlt,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {uri ? (
        <Animated.Image
          source={{ uri }}
          onLoad={() => setLoaded(true)}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          style={{
            ...StyleSheetAbsoluteFill,
            opacity: fade,
          }}
        />
      ) : (
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <ImageIcon size={28} color={p.inkFaint} />
          <Text style={[t.labelSm, { color: p.inkFaint }]}>
            PHOTO NOT YET PUBLISHED
          </Text>
        </View>
      )}
      {children}
    </View>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%' as const,
  height: '100%' as const,
};

/* ── containers ──────────────────────────────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  padded?: boolean;
}) {
  const p = usePalette();
  const surface = useCardSurface();
  const base: ViewStyle = {
    ...surface,
    ...(padded ? { padding: space.gutter } : null),
  };

  if (!onPress) return <View style={[base, style]}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        base,
        pressed && { backgroundColor: p.surfaceAlt },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * A single-choice chip row.
 *
 * Selection animates the fill rather than swapping it, which is the
 * difference between a filter that feels responsive and one that feels
 * like a page reload.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  scroll = true,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  const row = options.map((option) => (
    <Chip
      key={option.value}
      label={option.label}
      selected={option.value === value}
      onPress={() => onChange(option.value)}
    />
  ));

  if (!scroll) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {row}
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: space.sm,
        paddingVertical: space.xs,
        // Trailing room so the last chip can scroll clear of whatever sits
        // beside the row. Without it the final chip is sheared mid-word by
        // the filter button and reads as a rendering fault rather than as
        // content that scrolls.
        paddingRight: space.gutter,
      }}
    >
      {row}
    </ScrollView>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  grow,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  grow?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      // Android draws a rectangular ripple behind a Pressable by default,
      // which on a pill leaves a visible square corner behind the round
      // shape. Bounded to the pill's own radius instead.
      android_ripple={{ color: p.surfaceAlt, radius: 0, borderless: false }}
      style={({ pressed }) => ({
        flex: grow ? 1 : undefined,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space.gutter,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? p.brand : p.line,
        backgroundColor: selected ? p.brand : p.surface,
        opacity: pressed ? 0.8 : 1,
        overflow: 'hidden',
      })}
    >
      <Text
        style={[t.labelMd, { color: selected ? p.brandInk : p.inkSoft }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type PillTone = 'neutral' | 'ok' | 'warn' | 'danger' | 'brand';

/**
 * A status label. The TEXT always carries the meaning — tone is never the
 * only signal, so it survives colour-vision deficiency and greyscale.
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
      <Text style={[t.labelSm, { color: fg }]}>{children}</Text>
    </View>
  );
}

/**
 * The verified badge, as it sits on a photograph.
 *
 * Distinct from `Pill` on purpose: this one has to stay legible over an
 * arbitrary image, so it carries a solid brand fill and its own mark rather
 * than the tinted background a status pill uses on a flat surface. It is
 * the reference's single most repeated trust signal.
 */
export function VerifiedBadge({ label = 'Verified' }: { label?: string }) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: p.verified,
        borderRadius: radius.pill,
        paddingLeft: space.sm,
        paddingRight: space.md,
        paddingVertical: 5,
        alignSelf: 'flex-start',
      }}
    >
      <CheckIcon size={13} color={p.verifiedInk} />
      <Text style={[t.labelSm, { color: p.verifiedInk }]}>{label}</Text>
    </View>
  );
}

/* ── controls ────────────────────────────────────────────────────────── */

/**
 * The button.
 *
 * It owns no margin: spacing belongs to the layout doing the stacking. Its
 * radius is `radius.control`, the same value `Field` uses — a form whose
 * input and its submit are cut to different shapes reads as two components
 * that happened to land next to each other.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const p = usePalette();
  const inert = disabled || busy;

  const variants: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: p.brand, fg: p.brandInk, border: p.brand },
    outline: { bg: p.surface, fg: p.ink, border: p.line },
    ghost: { bg: 'transparent', fg: p.inkSoft, border: 'transparent' },
    danger: { bg: p.surface, fg: p.danger, border: p.line },
  };
  const v = variants[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!busy }}
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          gap: space.sm,
          minHeight: 52,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: 1,
          borderRadius: radius.control,
          paddingHorizontal: space.lg,
          opacity: inert ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          <Text style={[t.labelLg, { color: v.fg }]}>{label}</Text>
          {icon}
        </>
      )}
    </Pressable>
  );
}

/**
 * A labelled text field.
 *
 * `error` is a string, not a boolean: a red outline with no words is a
 * colour-only signal — invisible to a red-green colour-blind user,
 * invisible in greyscale, and useless to anyone who cannot guess which rule
 * they broke. The message is the error; the border only says where.
 */
export function Field({
  label,
  hint,
  prefix,
  trailing,
  error,
  containerStyle,
  ...props
}: TextInputProps & {
  label?: string;
  hint?: string;
  prefix?: React.ReactNode;
  trailing?: React.ReactNode;
  error?: string | null;
  containerStyle?: ViewStyle;
}) {
  const p = usePalette();
  return (
    // Fields stack in forms, so the gap between them is the field's own
    // business. Leaving it to each form produced exactly the inconsistency
    // it sounds like: a field followed by a hint sat flush against the next
    // field's label, while one without a hint looked correctly spaced.
    <View style={[{ marginBottom: space.gutter }, containerStyle]}>
      {label ? (
        <Text style={[t.labelMd, { color: p.ink, marginBottom: space.sm }]}>
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          backgroundColor: p.surfaceInput,
          borderRadius: radius.control,
          borderWidth: 1,
          borderColor: error ? p.danger : p.line,
          paddingLeft: space.gutter,
          paddingRight: space.sm,
        }}
      >
        {prefix}
        <TextInput
          placeholderTextColor={p.inkFaint}
          accessibilityLabel={label}
          {...props}
          style={[
            t.bodyMd,
            { flex: 1, color: p.ink, paddingVertical: space.md },
          ]}
        />
        {trailing}
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[t.bodySm, { color: p.danger, marginTop: space.xs }]}
        >
          {error}
        </Text>
      ) : hint ? (
        <Text style={[t.bodySm, { color: p.inkSoft, marginTop: space.xs }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The password reveal control, as a word rather than an eye.
 *
 * "Show" states what pressing it does, needs no legend, and cannot render
 * as a full-colour emoji on one platform and an empty box on another.
 */
export function RevealToggle({
  revealed,
  onToggle,
}: {
  revealed: boolean;
  onToggle: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
      onPress={onToggle}
      hitSlop={8}
      style={{
        minHeight: 44,
        justifyContent: 'center',
        paddingHorizontal: space.sm,
      }}
    >
      <Text style={[t.labelMd, { color: p.inkSoft }]}>
        {revealed ? 'Hide' : 'Show'}
      </Text>
    </Pressable>
  );
}

/* ── feedback ────────────────────────────────────────────────────────── */

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
        borderRadius: radius.control,
        padding: space.gutter,
        marginBottom: space.md,
      }}
    >
      <Text style={[t.bodySm, { color: fg }]}>
        {message}
        {code ? `  (${code})` : ''}
      </Text>
    </View>
  );
}

/**
 * A trust band — the escrow guarantee, the free-for-tenants assurance.
 *
 * Tinted rather than bordered, because it is a reassurance rather than a
 * warning, and it should read as part of the page instead of an interrupt.
 */
export function TrustNote({
  title,
  children,
  icon,
}: {
  title?: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        backgroundColor: p.brandSoft,
        borderRadius: radius.control,
        padding: space.gutter,
      }}
    >
      {icon ? <View style={{ paddingTop: 2 }}>{icon}</View> : null}
      <View style={{ flex: 1 }}>
        {title ? (
          <Text style={[t.labelMd, { color: p.brand, marginBottom: 2 }]}>
            {title}
          </Text>
        ) : null}
        <Text style={[t.bodySm, { color: p.inkSoft }]}>{children}</Text>
      </View>
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const p = usePalette();
  return (
    <View style={{ padding: space.xl, alignItems: 'center' }}>
      <ActivityIndicator color={p.brand} />
      {label ? (
        <Text style={[t.bodySm, { color: p.inkSoft, marginTop: space.md }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A loading placeholder shaped like the thing that is coming.
 *
 * Pulsing a card-shaped block tells someone a card is arriving; a spinner
 * in the middle of the screen tells them only that something is happening.
 * On a slow connection that difference is most of the perceived speed.
 */
export function Skeleton({
  height,
  aspectRatio,
  width = '100%',
  radius: r = radius.control,
  style,
}: {
  /** Give either a height or an aspectRatio — never both. */
  height?: number;
  aspectRatio?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
}) {
  const p = usePalette();
  const pulse = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          ...(aspectRatio ? { aspectRatio } : { height }),
          width,
          borderRadius: r,
          backgroundColor: p.skeleton,
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

/**
 * An empty state: what is not here, why, and what to do about it.
 *
 * No illustration. The reference draws one — a house inside a tinted circle
 * — and it carries nothing a screen reader can reach and nothing a sighted
 * user needs, while pushing the sentence that actually helps further down.
 * The words are the empty state.
 */
export function Empty({
  title,
  message,
  action,
}: {
  title: string;
  message?: string | null;
  action?: React.ReactNode;
}) {
  const p = usePalette();
  const surface = useCardSurface();
  return (
    <View style={[surface, { padding: space.lg }]}>
      <Text style={[t.headlineSm, { color: p.ink, marginBottom: space.sm }]}>
        {title}
      </Text>
      {message ? (
        <Text style={[t.bodySm, { color: p.inkSoft }]}>{message}</Text>
      ) : null}
      {action ? <View style={{ marginTop: space.gutter }}>{action}</View> : null}
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
        paddingVertical: space.md,
      }}
    >
      <Text style={[t.bodySm, { color: p.inkSoft, flexShrink: 0 }]}>
        {label}
      </Text>
      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        {typeof value === 'string' ? (
          <Text
            style={[
              strong ? t.labelLg : t.labelMd,
              { color: p.ink, textAlign: 'right' },
            ]}
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
  return <View style={{ height: 1, backgroundColor: p.line }} />;
}

/**
 * A property attribute — "3 Bed", "2 Bath".
 *
 * The icon earns its place here: these sit in a tight row where the label
 * is two words, and the glyph is what makes the row scannable at a glance
 * rather than read left to right.
 */
export function Attribute({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  const p = usePalette();
  return (
    <View style={{ alignItems: 'center', gap: space.xs, flex: 1 }}>
      {icon}
      <Text style={[t.labelSm, { color: p.inkSoft }]}>{label}</Text>
    </View>
  );
}
