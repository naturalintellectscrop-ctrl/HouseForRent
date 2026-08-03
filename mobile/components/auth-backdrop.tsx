import { View } from 'react-native';
import { PhotoPlaceholder } from '@/components/ui';
import { radius, space, usePalette } from '@/lib/theme';

/**
 * The staggered property collage behind the auth sheets, as in the
 * reference.
 *
 * ── Why placeholders and not photographs ──
 * The reference fills this with stock house photography. Ours cannot:
 * every property image on this platform comes from a field officer's
 * capture via `MediaStorageProvider`, and V1's provider is a mock that
 * serves no bytes. Dropping in stock houses would put pictures of homes
 * that do not exist behind a sign-in screen for a product whose entire
 * proposition is that what you see was verified in person. So the collage
 * keeps the reference's rhythm using brand-tinted blocks, and becomes real
 * photography the moment the storage provider is swapped.
 */
export function AuthBackdrop({ rows = 3 }: { rows?: number }) {
  const p = usePalette();

  // Three columns with alternating vertical offsets, matching the
  // reference's staggered masonry.
  const columns = [
    { offset: 0, heights: [96, 118, 104] },
    { offset: 26, heights: [124, 100, 112] },
    { offset: 8, heights: [104, 126, 96] },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.md,
        paddingHorizontal: space.lg,
        paddingTop: space.xl,
        backgroundColor: p.bg,
      }}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {columns.map((column, index) => (
        <View
          key={index}
          style={{ flex: 1, gap: space.md, marginTop: column.offset }}
        >
          {column.heights.slice(0, rows).map((height, i) => (
            <View
              key={i}
              style={{
                height,
                borderRadius: radius.md,
                backgroundColor: i % 2 === 0 ? p.brandSoft : p.surfaceAlt,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PhotoPlaceholder size={height * 0.42} radius={radius.sm} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
