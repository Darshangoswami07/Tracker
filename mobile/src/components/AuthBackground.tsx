import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Soft premium canvas behind the auth screens: a pure white base with a very
 * subtle lavender radial glow (fading in behind the hero and a faint wash near
 * the bottom) plus almost-transparent decorative lavender wave shapes along the
 * bottom edge. Static, no large colored blocks, no harsh gradients.
 */
export const AuthBackground = () => {
  const { width, height } = useWindowDimensions();

  const heroGlowHeight = Math.round(height * 0.42);
  const bottomGlowTop = Math.round(height * 0.52);
  const waveHeight = Math.round(height * 0.22);
  const waveTop = height - waveHeight * 0.62;

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          {/* Soft lavender radial glow behind the hero */}
          <RadialGradient id="heroGlow" cx="50%" cy="2%" rx="80%" ry="90%">
            <Stop offset="0" stopColor="#E7E0FF" />
            <Stop offset="0.6" stopColor="#F3EFFF" />
            <Stop offset="1" stopColor="#FFFFFF" />
          </RadialGradient>
          {/* Gentle centre lavender kiss */}
          <RadialGradient id="centreGlow" cx="50%" cy="40%" rx="60%" ry="46%">
            <Stop offset="0" stopColor="#F4F1FF" />
            <Stop offset="1" stopColor="#FFFFFF" />
          </RadialGradient>
          {/* Bottom soft lavender wash behind the decorative waves */}
          <RadialGradient id="bottomGlow" cx="50%" cy="100%" rx="78%" ry="70%">
            <Stop offset="0" stopColor="#E9E3FF" />
            <Stop offset="1" stopColor="#FFFFFF" />
          </RadialGradient>
        </Defs>

        <Rect width={width} height={height} fill="#FFFFFF" />
        <Rect y={0} width={width} height={heroGlowHeight} fill="url(#heroGlow)" opacity={0.3} />
        <Rect y={0} width={width} height={height} fill="url(#centreGlow)" opacity={0.26} />
        <Rect y={bottomGlowTop} width={width} height={height - bottomGlowTop} fill="url(#bottomGlow)" opacity={0.3} />

        {/* Layered decorative wave shapes near the bottom edge */}
        <Path
          d={`M0 ${waveTop + 56} C ${width * 0.22} ${waveTop - 42}, ${width * 0.4} ${waveTop + 96}, ${width * 0.62} ${waveTop + 34} C ${width * 0.82} ${waveTop - 26}, ${width * 0.94} ${waveTop + 74}, ${width} ${waveTop + 24} L ${width} ${height} L 0 ${height} Z`}
          fill="#EFEAFF"
          opacity={0.45}
        />
        <Path
          d={`M0 ${waveTop + 118} C ${width * 0.18} ${waveTop + 58}, ${width * 0.46} ${waveTop + 150}, ${width * 0.7} ${waveTop + 96} C ${width * 0.86} ${waveTop + 62}, ${width * 0.95} ${waveTop + 130}, ${width} ${waveTop + 104} L ${width} ${height} L 0 ${height} Z`}
          fill="#E6DFFF"
          opacity={0.38}
        />
      </Svg>
    </View>
  );
};
