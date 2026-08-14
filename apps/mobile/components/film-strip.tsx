import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { radius, space, usePalette } from '@/lib/theme';

/**
 * The property collage, drifting like film strips.
 *
 * ── How the loop is seamless ──
 * Each column renders its tiles TWICE and translates by exactly the height
 * of one pass. At the moment the animation completes, the second copy sits
 * precisely where the first began, so resetting to zero is invisible.
 * Anything less exact shows a jump once per cycle, which is the tell that
 * separates this effect from a carousel.
 *
 * ── Why the columns disagree ──
 * Adjacent columns run in opposite directions and at different speeds. Three
 * columns marching in lockstep read as one sliding sheet; offsetting them
 * makes the wall feel like depth rather than a texture.
 *
 * ── Native driver only ──
 * `translateY` and `opacity` are the only things animated here, both of
 * which the native driver handles, so the whole effect runs off the JS
 * thread. On a mid-range Android that is the difference between a drift and
 * a stutter, and this screen is the first thing anyone sees (NFR-5).
 */

/** One pass takes this long, per column. Slow on purpose — this is ambience. */
const DURATIONS = [38000, 46000, 42000] as const;

export function FilmStrip({
  tiles,
  columns = 3,
  tileHeight = 150,
  height,
}: {
  tiles: ImageSourcePropType[];
  columns?: number;
  tileHeight?: number;
  height: number;
}) {
  const p = usePalette();
  const [reduceMotion, setReduceMotion] = useState(false);

  /**
   * A drifting wall of images is exactly the kind of continuous background
   * motion that provokes nausea in people with vestibular disorders, and it
   * carries no information — so when the system asks for reduced motion,
   * the columns simply stand still. The screen loses nothing but the drift.
   */
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (alive) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (on) => setReduceMotion(on),
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Deal the tiles round-robin so neighbouring columns never start on the
  // same picture.
  const perColumn: ImageSourcePropType[][] = Array.from(
    { length: columns },
    (_, c) => tiles.filter((_, i) => i % columns === c),
  );

  return (
    <View
      style={{ height, flexDirection: 'row', gap: space.md, overflow: 'hidden' }}
      // Decorative: it is the same properties the feed already lists, and a
      // screen reader announcing nine unlabelled images would be noise.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {perColumn.map((column, index) => (
        <Column
          key={index}
          tiles={column}
          tileHeight={tileHeight}
          duration={DURATIONS[index % DURATIONS.length]}
          reverse={index % 2 === 1}
          paused={reduceMotion}
          offset={index * 28}
        />
      ))}
    </View>
  );
}

function Column({
  tiles,
  tileHeight,
  duration,
  reverse,
  paused,
  offset,
}: {
  tiles: ImageSourcePropType[];
  tileHeight: number;
  duration: number;
  reverse: boolean;
  paused: boolean;
  offset: number;
}) {
  const p = usePalette();
  const progress = useRef(new Animated.Value(0)).current;
  const passHeight = tiles.length * (tileHeight + space.md);

  useEffect(() => {
    if (paused) {
      progress.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, duration, paused]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: reverse ? [-passHeight, 0] : [0, -passHeight],
  });

  return (
    <View style={{ flex: 1, marginTop: offset }}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {/* Twice, so the tail of one pass meets the head of the next. */}
        {[...tiles, ...tiles].map((source, i) => (
          <Image
            key={i}
            source={source}
            style={{
              width: '100%',
              height: tileHeight,
              borderRadius: radius.control,
              marginBottom: space.md,
              backgroundColor: p.skeleton,
            }}
            resizeMode="cover"
          />
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * A stepped fade from transparent to the page colour.
 *
 * The collage has to stop somewhere, and a hard edge across nine images
 * reads as a crop. There is no gradient primitive in React Native and no
 * gradient library in this project, so this stacks a few bands of the page
 * colour at rising opacity — at these sizes it is indistinguishable from a
 * real gradient and costs nothing.
 */
export function FadeToPage({ height = 96 }: { height?: number }) {
  const p = usePalette();
  const bands = 8;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }}
    >
      {Array.from({ length: bands }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            backgroundColor: p.bg,
            opacity: (i + 1) / bands,
          }}
        />
      ))}
    </View>
  );
}
