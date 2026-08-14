import { type ComponentProps, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ComponentProps<typeof Ionicons>['name'];
  color: string;
  trend?: { value: number; label: string; isPercentage?: boolean };
  animate?: boolean;
}

export const StatCard = ({ title, value, icon, color, trend, animate = true }: StatCardProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const [scaleAnim] = useState(new Animated.Value(1));
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  useEffect(() => {
    if (animate) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay: Math.random() * 200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: Math.random() * 200, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    }
  }, [animate, fadeAnim, slideAnim]);

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.md },
        { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.iconContainer}>
        <View style={[styles.iconBg, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        {trend && (
          <View style={[styles.trendBadge, { backgroundColor: trend.value >= 0 ? '#10B98115' : '#EF444415', borderRadius: radii.pill }]}>
            <Ionicons name={trend.value >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trend.value >= 0 ? '#10B981' : '#EF4444'} />
            <Text style={[styles.trendText, { color: trend.value >= 0 ? '#10B981' : '#EF4444' }]}>
              {trend.isPercentage ? `${trend.value}%` : `${trend.value >= 0 ? '+' : ''}${trend.value}`}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={[styles.value, { color: colors.textPrimary, fontSize: fonts.size.xl }]}>{value}</Text>
        <Text style={[styles.title, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>{title}</Text>
        {trend && <Text style={[styles.trendLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{trend.label}</Text>}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 20, flex: 1, minWidth: 0 },
  iconContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  iconBg: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  trendText: { fontSize: 11, fontWeight: '700' },
  content: { gap: 4 },
  value: { fontWeight: '800', letterSpacing: -0.5 },
  title: { fontWeight: '600' },
  trendLabel: { fontWeight: '500' },
});

export default StatCard;