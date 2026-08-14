import { ActivityIndicator, StyleSheet, Text, TouchableWithoutFeedback } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useAppTheme } from '../theme/useAppTheme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
}

/** Primary interactive button with a subtle spring press animation. */
export const AppButton = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
}: ButtonProps) => {
  const { colors, radii, spacing, shadows } = useAppTheme();
  const scale = useSharedValue(1);

  const pressIn = () => {
    scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
  };

  const pressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const isDisabled = disabled || loading;

  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.primarySoft
        : 'transparent';

  const foreground =
    variant === 'primary'
      ? colors.onPrimary
      : variant === 'secondary'
        ? colors.primary
        : colors.primary;

  const borderColor = variant === 'outline' ? colors.borderStrong : 'transparent';

  return (
    <TouchableWithoutFeedback
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => {
        if (!isDisabled) onPress();
      }}
      disabled={isDisabled}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: background,
            borderColor,
            borderRadius: radii.md,
            paddingVertical: spacing.lg + 2,
            opacity: isDisabled ? 0.6 : 1,
          },
          variant !== 'outline' && shadows.sm,
          animatedStyle,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? colors.onPrimary : colors.primary}
          />
        ) : (
          <Text
            style={[
              styles.label,
              {
                color: foreground,
                fontSize: spacing.lg,
              },
            ]}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: {
    fontWeight: '700',
  },
});