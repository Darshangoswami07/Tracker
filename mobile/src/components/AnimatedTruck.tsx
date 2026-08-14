import { View } from 'react-native';
import Svg, { Circle, Ellipse, Rect } from 'react-native-svg';

const BOX = '#635BFF';
const BOX_MID = '#7366F7';
const CABIN = '#4A3FD8';
const WINDOW = '#DCD5FF';
const WHEEL = '#3B34B8';
const HUB = '#6A5CFF';
const SPEED = '#8A7CFF';

/**
 * Static premium truck icon for the logo badge: a filled purple cargo box and a
 * dark purple cabin, two wheels, white highlights and speed lines behind. Drawn
 * as a flat SVG, fills roughly 70% of the badge. No animation.
 */
export const TruckGlyph = ({ size = 50 }: { size?: number }) => {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        {/* Soft ground shadow */}
        <Ellipse cx={52} cy={84} rx={40} ry={5} fill={BOX} opacity={0.14} />

        {/* Speed lines behind the truck */}
        <Rect x={4} y={40} width={18} height={5} rx={2.5} fill={SPEED} opacity={0.5} />
        <Rect x={2} y={54} width={14} height={5} rx={2.5} fill={SPEED} opacity={0.42} />
        <Rect x={5} y={68} width={11} height={4.5} rx={2.25} fill={SPEED} opacity={0.34} />

        {/* Cargo box — filled purple body */}
        <Rect x={16} y={30} width={44} height={42} rx={6} fill={BOX} />
        <Rect x={22} y={35} width={32} height={6} rx={3} fill="#FFFFFF" opacity={0.3} />
        <Rect x={22} y={48} width={32} height={17} rx={4} fill={BOX_MID} opacity={0.5} />
        <Rect x={42} y={35} width={2.5} height={31} rx={1.25} fill="#FFFFFF" opacity={0.28} />

        {/* Cabin — dark purple */}
        <Rect x={62} y={34} width={26} height={38} rx={8} fill={CABIN} />
        <Rect x={67} y={39} width={16} height={16} rx={4} fill={WINDOW} />

        {/* Wheels */}
        <Circle cx={36} cy={74} r={11} fill={WHEEL} />
        <Circle cx={36} cy={74} r={5} fill={HUB} />
        <Circle cx={72} cy={74} r={11} fill={WHEEL} />
        <Circle cx={72} cy={74} r={5} fill={HUB} />
      </Svg>
    </View>
  );
};
