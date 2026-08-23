import { Animated, StyleSheet, View, Platform, Dimensions } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';
import { useEffect, useState } from 'react';

const { width } = Dimensions.get('window');

interface ShimmerCardProps {
  style?: any;
  height?: number;
  borderRadius?: number;
}

export const ShimmerCard = ({ style, height = 100, borderRadius = 16 }: ShimmerCardProps) => {
  const { colors } = useAppTheme();
  const [anim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: Platform.OS !== 'web',
      })
    ).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.surfaceMuted, height, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [
              { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-width, width] }) },
              { skewX: '-15deg' },
            ],
          },
        ]}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: { overflow: 'hidden', position: 'relative' },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: 100,
  },
});

export default ShimmerCard;