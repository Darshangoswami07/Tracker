import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';
import { ShimmerCard } from './ShimmerCard';

/**
 * Placeholder matching `StatCard`'s exact structure (icon box, value line,
 * title line) — shown in its place while the card's API data hasn't arrived
 * yet, so the dashboard never has to render a fake ₹0/0 value.
 */
export const StatCardSkeleton = () => {
  const { colors, radii, shadows } = useAppTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.md }]}>
      <ShimmerCard style={styles.iconSkeleton} height={44} borderRadius={12} />
      <View style={styles.content}>
        <ShimmerCard style={styles.valueSkeleton} height={22} borderRadius={6} />
        <ShimmerCard style={styles.titleSkeleton} height={14} borderRadius={4} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { padding: 20, flex: 1, minWidth: 0 },
  iconSkeleton: { width: 44, marginBottom: 12 },
  content: { gap: 8 },
  valueSkeleton: { width: '60%' },
  titleSkeleton: { width: '80%' },
});

export default StatCardSkeleton;
