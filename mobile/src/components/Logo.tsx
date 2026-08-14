import { Platform, StyleSheet, Text, View } from 'react-native';
import { TruckGlyph } from './AnimatedTruck';
import { useAppTheme } from '../theme/useAppTheme';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const TILE_SIZE: Record<NonNullable<LogoProps['size']>, number> = {
  sm: 56,
  md: 72,
  lg: 88,
};

const WORDMARK_SIZE: Record<NonNullable<LogoProps['size']>, number> = {
  sm: 22,
  md: 27,
  lg: 31,
};

const TAGLINE_SIZE: Record<NonNullable<LogoProps['size']>, number> = {
  sm: 10,
  md: 12,
  lg: 14,
};

/**
 * DeliveryHub brand logo: a 72px white rounded-square badge with a thin purple
 * border and a soft shadow, holding the static filled-purple truck icon, the
 * "Delivery" + "Hub" wordmark and the "Transport Management" subtitle. Static.
 */
export const Logo = ({ size = 'md' }: LogoProps) => {
  const { colors, spacing } = useAppTheme();
  const tile = TILE_SIZE[size];
  const wordmark = WORDMARK_SIZE[size];
  const tagline = TAGLINE_SIZE[size];
  const radius = Math.round(tile * 0.25);
  const inner = Math.round(tile * 0.68);

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.tile,
          {
            width: tile,
            height: tile,
            borderRadius: radius,
            borderWidth: 2,
            borderColor: colors.primary,
            backgroundColor: '#FFFFFF',
          },
        ]}
      >
        <TruckGlyph size={inner} />
      </View>

      <View style={{ marginTop: spacing.sm + 2 }}>
        <Text style={[styles.wordmark, { fontSize: wordmark, color: colors.textPrimary }]}>
          Delivery
          <Text style={{ color: colors.primary }}>Hub</Text>
        </Text>
      </View>
      <Text
        style={[
          styles.tagline,
          { fontSize: tagline, color: colors.textSecondary, marginTop: spacing.sm - 4 },
        ]}
      >
        Transport Management
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 6px 12px rgba(99, 91, 255, 0.12)' }
      : {
          shadowColor: '#635BFF',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 4,
        }),
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  tagline: {
    fontWeight: '500',
    letterSpacing: 0.6,
  },
});
