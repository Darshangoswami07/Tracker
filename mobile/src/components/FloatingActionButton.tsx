import { type ComponentProps, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

interface FloatingActionButtonProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  label?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const FloatingActionButton = ({ 
  icon, 
  onPress, 
  label, 
  color, 
  size = 'md' 
}: FloatingActionButtonProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const [scaleAnim] = useState(new Animated.Value(1));
  const [pressedAnim] = useState(new Animated.Value(0));

  const sizes = {
    sm: { width: 48, height: 48, iconSize: 20, labelGap: 6, paddingHorizontal: 12 },
    md: { width: 56, height: 56, iconSize: 24, labelGap: 8, paddingHorizontal: 16 },
    lg: { width: 64, height: 64, iconSize: 28, labelGap: 10, paddingHorizontal: 20 },
  };

  const s = sizes[size];
  const bgColor = color || colors.primary;

  const onPressIn = () => {
    Animated.timing(pressedAnim, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
    Animated.timing(scaleAnim, { toValue: 0.9, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  const onPressOut = () => {
    Animated.timing(pressedAnim, { toValue: 0, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
    Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: spacing.xl + 20,
        right: spacing.xl,
        zIndex: 100,
        transform: [{ scale: scaleAnim }],
      }}
    >
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: bgColor, width: s.width, height: s.height, borderRadius: radii.pill, ...shadows.lg }]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
      >
        <Ionicons name={icon} size={s.iconSize} color="#FFFFFF" />
      </TouchableOpacity>
      
      {label && (
        <Animated.View
          style={[
            styles.labelContainer,
            { bottom: s.height + spacing.sm, right: 0 },
            { opacity: pressedAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) },
          ]}
        >
          <View style={[styles.label, { backgroundColor: colors.surface, borderRadius: radii.md, ...shadows.md }]}>
            <Text style={[styles.labelText, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{label}</Text>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  fab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  labelText: {
    fontWeight: '700',
  },
});

export default FloatingActionButton;