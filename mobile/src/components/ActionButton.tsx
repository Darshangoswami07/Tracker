import { type ComponentProps } from 'react';
import { useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  icon?: IoniconName;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  rightIcon?: IoniconName;
}

export const ActionButton = ({ 
  label, 
  onPress, 
  icon, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false, 
  disabled = false, 
  loading = false,
  rightIcon,
}: ActionButtonProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const [scaleAnim] = useState(new Animated.Value(1));
  const [pressedAnim] = useState(new Animated.Value(0));

  const variants = {
    primary: { bg: colors.primary, text: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.secondary, text: colors.onPrimary, border: colors.secondary },
    outline: { bg: 'transparent', text: colors.primary, border: colors.primary },
    ghost: { bg: 'transparent', text: colors.textPrimary, border: 'transparent' },
    danger: { bg: '#EF4444', text: '#FFFFFF', border: '#EF4444' },
  };

  const sizes = {
    sm: { paddingHorizontal: 16, paddingVertical: 8, fontSize: fonts.size.sm, iconSize: 16, gap: 6, height: 36 },
    md: { paddingHorizontal: 24, paddingVertical: 12, fontSize: fonts.size.md, iconSize: 20, gap: 8, height: 48 },
    lg: { paddingHorizontal: 32, paddingVertical: 16, fontSize: fonts.size.lg, iconSize: 24, gap: 10, height: 56 },
  };

  const v = variants[variant];
  const s = sizes[size];

  const onPressIn = () => {
    if (!disabled && !loading) {
      Animated.timing(pressedAnim, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
      Animated.timing(scaleAnim, { toValue: 0.97, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
    }
  };

  const onPressOut = () => {
    Animated.timing(pressedAnim, { toValue: 0, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
    Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  const isDisabled = disabled || loading;

  return (
    <Animated.View
      style={{
        transform: [{ scale: scaleAnim }],
        opacity: isDisabled ? 0.6 : 1,
      }}
    >
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: v.bg, borderColor: v.border, borderWidth: variant === 'outline' ? 2 : 0, borderRadius: radii.pill, height: s.height },
          fullWidth && styles.fullWidth,
        ]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        disabled={isDisabled}
        activeOpacity={1}
        accessibilityState={{ disabled: isDisabled }}
      >
        {loading ? (
          <View style={styles.spinnerContainer}>
            <Animated.View style={styles.spinner} />
          </View>
        ) : (
          <View style={[styles.content, { gap: s.gap }]}>
            {icon && <Ionicons name={icon} size={s.iconSize} color={v.text} />}
            <Text style={[styles.text, { color: v.text, fontSize: s.fontSize }]}>{label}</Text>
            {rightIcon && <Ionicons name={rightIcon} size={s.iconSize} color={v.text} />}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  fullWidth: { width: '100%' },
  content: { flexDirection: 'row', alignItems: 'center' },
  text: { fontWeight: '800' },
  spinnerContainer: { width: 24, height: 24 },
  spinner: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: '#FFFFFF',
    borderRadius: 12,
  },
});

export default ActionButton;