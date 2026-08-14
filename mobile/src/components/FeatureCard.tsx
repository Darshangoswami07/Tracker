import { Ionicons } from '@expo/vector-icons';
import { type ComponentProps, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface FeatureCardProps {
  icon: IoniconName;
  title: string;
  description: string;
  color: string;
  width: number;
  entering?: unknown;
  /** Optional tap handler — omit to keep the existing display-only card behavior. */
  onPress?: () => void;
}

/** Premium feature card: white surface, soft shadow, custom ripple and a
 *  gentle press-scale for light touch/hover feedback. */
export const FeatureCard = ({ icon, title, description, color, width, entering, onPress }: FeatureCardProps) => {
  const { colors, radii, fonts, shadows } = useAppTheme();
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0.4)).current;

  const runRipple = () => {
    rippleScale.stopAnimation();
    rippleOpacity.stopAnimation();
    rippleScale.setValue(0);
    rippleOpacity.setValue(0.4);
    Animated.parallel([
      Animated.timing(rippleScale, { toValue: 1, duration: 420, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(rippleOpacity, { toValue: 0, duration: 420, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  };

  return (
    <Reanimated.View style={{ width }} entering={entering as never}>
      <Pressable
        onPressIn={runRipple}
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: colors.surface,
            borderRadius: radii.xl,
            ...shadows.sm,
            transform: [{ scale: pressed ? 0.975 : 1 }],
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <Animated.View
          style={[
            styles.ripple,
            { backgroundColor: color, opacity: rippleOpacity, transform: [{ scale: rippleScale }], pointerEvents: 'none' },
          ]}
        />
        <View style={[styles.iconTile, { backgroundColor: `${color}18`, borderRadius: radii.lg }]}>
          <Ionicons name={icon} size={22} color={color} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.md }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.desc, { color: colors.textSecondary, fontSize: fonts.size.sm, lineHeight: 19 }]}>
          {description}
        </Text>
      </Pressable>
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    overflow: 'hidden',
    gap: 8,
  },
  ripple: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 60,
  },
  iconTile: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  desc: {
    fontWeight: '500',
  },
});
