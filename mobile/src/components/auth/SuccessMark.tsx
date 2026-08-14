import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import type { IconName } from './StatusCard';

type Tone = 'success' | 'pending' | 'error';

interface SuccessMarkProps {
  tone?: Tone;
  size?: number;
  /** The main icon, defaulted by tone. */
  icon?: IconName;
}

const TONE_META: Record<Tone, { bg: string; halo: string; icon: IconName; color: string }> = {
  success: { bg: '#10B981', halo: '#D1FAE5', icon: 'checkmark', color: '#FFFFFF' },
  pending: { bg: '#F59E0B', halo: '#FEF3C7', icon: 'hourglass-outline', color: '#FFFFFF' },
  error: { bg: '#EF4444', halo: '#FEE2E2', icon: 'close', color: '#FFFFFF' },
};

/** Converts a `#rrggbb` hex color to an `rgba()` string at the given alpha. */
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

/** Premium pulsing badge used as the hero animation for success/error states. */
export const SuccessMark = ({ tone = 'success', size = 112, icon }: SuccessMarkProps) => {
  const { spacing } = useAppTheme();
  const meta = TONE_META[tone];

  const haloA = useRef(new Animated.Value(0.8)).current;
  const haloB = useRef(new Animated.Value(0.5)).current;
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ring = (value: Animated.Value) =>
      Animated.loop(
        Animated.timing(value, {
          toValue: 1,
          duration: 2000,
          easing: Easing.out(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        })
      );

    haloA.setValue(0);
    haloB.setValue(0.5);
    ring(haloA).start();
    ring(haloB).start();

    Animated.spring(pop, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: Platform.OS !== 'web',
    }).start();

    return () => {
      haloA.stopAnimation();
      haloB.stopAnimation();
      pop.stopAnimation();
    };
  }, [haloA, haloB, pop, tone, size]);

  const badge = size;
  const haloTranslate = haloA.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.28] });
  const haloOpacity = haloA.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const haloScale2 = haloB.interpolate({ inputRange: [0, 1], outputRange: [size * 0.9, size * 1.5] });
  const haloOpacity2 = haloB.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={[styles.wrap, { width: size * 2, height: size * 2 }]}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: meta.halo,
            opacity: haloOpacity,
            transform: [{ scale: haloA.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.6] }) }],
            pointerEvents: 'none',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderColor: meta.halo,
            opacity: haloOpacity2,
            transform: [{ scale: haloScale2 }],
            pointerEvents: 'none',
          },
        ]}
      />
      <Animated.View
        style={[
          styles.badge,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: meta.bg,
            transform: [{ scale: pop }],
            ...(Platform.OS === 'web'
              ? { boxShadow: `0 10px 24px ${hexToRgba(meta.bg, 0.3)}` }
              : { shadowColor: meta.bg }),
          },
        ]}
      >
        <Ionicons name={icon ?? meta.icon} size={size * 0.46} color={meta.color} />
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    borderWidth: 2,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS !== 'web' && {
      shadowOpacity: 0.3,
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 24,
      elevation: 6,
    }),
  },
});