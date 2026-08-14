import { type ComponentProps, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

interface EmptyStateProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  actionLabel?: string;
  onActionPress?: () => void;
  iconColor?: string;
}

export const EmptyState = ({ icon, title, subtitle, actionLabel, onActionPress, iconColor }: EmptyStateProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const [scaleAnim] = useState(new Animated.Value(1));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={{
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <View style={[styles.container, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
        <View style={[styles.iconContainer, { backgroundColor: (iconColor || '#635BFF') + '15', borderRadius: radii.xl }]}>
          <Ionicons name={icon} size={56} color={iconColor || '#635BFF'} />
        </View>
        <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.lg }]}>{title}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>{subtitle}</Text>
        {actionLabel && onActionPress && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#635BFF', borderRadius: radii.pill }]}
            onPress={onActionPress}
            activeOpacity={0.85}
          >
            <Text style={styles.actionText}>{actionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 32, alignItems: 'center', gap: 16, marginVertical: 8 },
  iconContainer: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '800', textAlign: 'center' },
  subtitle: { fontWeight: '500', textAlign: 'center', marginHorizontal: 24 },
  actionButton: { paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  actionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});

export default EmptyState;