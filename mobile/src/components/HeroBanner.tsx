import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { TruckIllustration } from './illustrations/TruckIllustration';
import { useAppTheme } from '../theme/useAppTheme';

interface HeroBannerProps {
  /** Fraction of the viewport height the banner should occupy. */
  heightFactor?: number;
}

/**
 * Full-bleed rounded-bottom hero banner shown at the top of the Sign In screen.
 * Occupies ~22% of the viewport height, stretches edge-to-edge with no
 * horizontal padding, and holds the static semi-3D delivery-truck SVG scene.
 */
export const HeroBanner = ({ heightFactor = 0.22 }: HeroBannerProps) => {
  const { colors } = useAppTheme();
  const { height } = useWindowDimensions();
  const heroHeight = Math.round(height * heightFactor);

  return (
    <View
      style={[
        styles.container,
        {
          height: heroHeight,
          backgroundColor: colors.heroBackground,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          pointerEvents: 'none',
        },
      ]}
    >
      <TruckIllustration />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
});
