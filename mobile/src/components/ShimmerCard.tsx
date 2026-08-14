import { Animated, StyleSheet, View, Platform } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';
import { useEffect } from 'react';

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
            left: anim.interpolate({ inputRange: [0, 1], outputRange: [-width, width] }),
          },
        ]}
      />
    </Animated.View>
  );
};

import { useState } from 'react';
import { Dimensions } from 'react-native';
const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  card: { overflow: 'hidden', position: 'relative' },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.3)',
    transform: [{ skewX: '-15deg' }],
    width: 100,
  },
});

export default ShimmerCard;