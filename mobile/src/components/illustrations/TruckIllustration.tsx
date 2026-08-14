import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/* --- Palette ----------------------------------------------------------- */
const SKY_TOP = '#E9E4FF';
const SKY_BOTTOM = '#FBF9FF';
const SUN = '#E2DAFF';
const HAZE = '#E4DEFF';
const FAR = '#D6D1FA';
const MID = '#C4BCF4';
const WAREHOUSE = '#B4ABF1';
const WAREHOUSE_ROOF = '#A79EEF';
const WAREHOUSE_DOOR = '#9A90EC';
const TOWER = '#9A8FEA';
const TOWER_WINDOW = '#FFFFFF';
const ROAD = '#E8E3FF';
const ROAD_LINE = '#B9B0F4';
const ROAD_SHADOW = '#CBC4F4';
const GROUND_SHADOW = '#C2BBF2';
const STR_WHITE = '#FFFFFF';
const MOTION_LIGHT = '#B9B0F4';
const BASE = '#5A4BE8';
const HIGHLIGHT = '#FFFFFF';

/* --- Truck ------------------------------------------------------------- */
const BOX_SIDE = '#A89EEE';
const BOX_FACE = '#C2BAF7';
const BOX_TOP = '#D8D2FB';
const BOX_TRIM = '#A99FEF';
const CABIN = '#7B6DFF';
const CABIN_DARK = '#6A5BF2';
const WINDOW = '#3B34B8';
const WHEEL = '#3B34B8';
const HUB = '#8A7CFF';
const SEAM = '#FFFFFF';

/**
 * Premium semi-3D hero illustration for the Sign In screen: a modern delivery
 * truck (light cargo box with a softly shaded front + side faces, purple cabin,
 * dark windows, rounded wheels with hubs) sitting on a thin lavender road with
 * static motion streaks behind it. Backdrop is a soft lavender sky with large
 * blurred clouds and a layered, receding skyline — a tall central skyscraper,
 * a sawtooth-roofed warehouse and faded small buildings. Completely static,
 * drawn as one 400x200 SVG that scales responsively.
 */
export const TruckIllustration = () => {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      style={{ flex: 1 }}
    >
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={SKY_TOP} />
          <Stop offset="1" stopColor={SKY_BOTTOM} />
        </LinearGradient>
      </Defs>

      {/* Sky */}
      <Rect width={400} height={200} fill="url(#sky)" />
      <Ellipse cx={200} cy={148} rx={190} ry={48} fill={HAZE} opacity={0.5} />

      {/* Soft sun */}
      <Circle cx={262} cy={44} r={92} fill={SUN} opacity={0.45} />

      {/* Large, soft, low-opacity clouds */}
      <G fill="#FFFFFF" opacity={0.55}>
        <Ellipse cx={58} cy={44} rx={30} ry={15} />
        <Ellipse cx={96} cy={36} rx={38} ry={18} />
        <Ellipse cx={132} cy={46} rx={26} ry={13} />
        <Ellipse cx={104} cy={50} rx={20} ry={10} />
      </G>
      <G fill="#FFFFFF" opacity={0.5}>
        <Ellipse cx={286} cy={36} rx={26} ry={13} />
        <Ellipse cx={318} cy={28} rx={34} ry={17} />
        <Ellipse cx={350} cy={38} rx={22} ry={11} />
        <Ellipse cx={322} cy={42} rx={18} ry={9} />
      </G>

      {/* Skyline — far layer (most faded) */}
      <G fill={FAR} opacity={0.4}>
        <Rect x={14} y={130} width={18} height={28} rx={2} />
        <Rect x={36} y={140} width={14} height={18} rx={2} />
        <Rect x={54} y={124} width={20} height={34} rx={2} />
        <Rect x={78} y={136} width={13} height={22} rx={2} />
        <Rect x={96} y={128} width={17} height={30} rx={2} />
        <Rect x={116} y={142} width={14} height={16} rx={2} />
      </G>

      {/* Warehouse — long low building with sawtooth roof */}
      <G>
        <Rect x={30} y={118} width={170} height={40} rx={3} fill={WAREHOUSE} opacity={0.78} />
        <G fill={WAREHOUSE_ROOF} opacity={0.9}>
          <Rect x={44} y={110} width={26} height={10} rx={1} />
          <Rect x={74} y={106} width={28} height={14} rx={1} />
          <Rect x={106} y={110} width={26} height={10} rx={1} />
          <Rect x={136} y={106} width={28} height={14} rx={1} />
          <Rect x={168} y={110} width={26} height={10} rx={1} />
        </G>
        <Rect x={54} y={136} width={26} height={22} rx={2} fill={WAREHOUSE_DOOR} opacity={0.5} />
        <Rect x={122} y={136} width={26} height={22} rx={2} fill={WAREHOUSE_DOOR} opacity={0.5} />
      </G>

      {/* Skyline — mid buildings */}
      <G fill={MID} opacity={0.6}>
        <Rect x={222} y={128} width={20} height={32} rx={2} />
        <Rect x={246} y={114} width={24} height={46} rx={2} />
        <Rect x={274} y={136} width={18} height={24} rx={2} />
        <Rect x={296} y={122} width={22} height={38} rx={2} />
        <Rect x={322} y={130} width={20} height={30} rx={2} />
        <Rect x={346} y={136} width={18} height={24} rx={2} />
        <Rect x={368} y={144} width={16} height={16} rx={2} />
      </G>

      {/* Skyline — tall centre skyscraper (behind the truck) */}
      <G opacity={0.92}>
        <Rect x={196} y={52} width={46} height={106} rx={5} fill={TOWER} />
        <Rect x={214} y={32} width={10} height={24} rx={2} fill={TOWER} />
        <Line x1={219} y1={32} x2={219} y2={20} stroke={TOWER} strokeWidth={3} />
        <G fill={TOWER_WINDOW} opacity={0.45}>
          <Rect x={204} y={66} width={10} height={7} rx={1.5} />
          <Rect x={222} y={66} width={10} height={7} rx={1.5} />
          <Rect x={204} y={78} width={10} height={7} rx={1.5} />
          <Rect x={222} y={78} width={10} height={7} rx={1.5} />
          <Rect x={204} y={90} width={10} height={7} rx={1.5} />
          <Rect x={222} y={90} width={10} height={7} rx={1.5} />
        </G>
      </G>

      {/* Thin road + soft shadow + lavender centre line */}
      <Rect y={166} width={400} height={14} fill={ROAD} />
      <Rect y={163} width={400} height={5} fill={ROAD_SHADOW} opacity={0.5} />
      <G stroke={ROAD_LINE} strokeWidth={3} strokeLinecap="round" strokeDasharray="1 11">
        <Line x1={18} y1={173} x2={382} y2={173} />
      </G>

      {/* Static horizontal motion streaks behind the truck */}
      <G opacity={0.9}>
        <Rect x={16} y={108} width={62} height={5} rx={2.5} fill={STR_WHITE} opacity={0.55} />
        <Rect x={8} y={126} width={46} height={5} rx={2.5} fill={MOTION_LIGHT} opacity={0.7} />
        <Rect x={22} y={142} width={36} height={4} rx={2} fill={STR_WHITE} opacity={0.45} />
      </G>

      {/* Soft ground shadow under the truck */}
      <Ellipse cx={206} cy={176} rx={92} ry={9} fill={GROUND_SHADOW} opacity={0.5} />

      {/* Premium semi-3D delivery truck */}
      <G>
        {/* Base plate */}
        <Rect x={132} y={152} width={148} height={6} rx={3} fill={BASE} opacity={0.5} />

        {/* Cargo box — light shadowed faces for depth */}
        <Rect x={220} y={98} width={14} height={56} rx={4} fill={BOX_SIDE} />
        <Rect x={130} y={94} width={92} height={62} rx={8} fill={BOX_FACE} />
        <Rect x={132} y={88} width={90} height={10} rx={4} fill={BOX_TOP} />
        <Rect x={136} y={100} width={84} height={4} rx={2} fill={HIGHLIGHT} opacity={0.4} />
        <Rect x={134} y={138} width={88} height={14} rx={5} fill={BOX_TRIM} opacity={0.6} />
        <Rect x={176} y={101} width={3} height={50} rx={1.5} fill={SEAM} opacity={0.5} />

        {/* Cabin — purple */}
        <Rect x={234} y={96} width={46} height={56} rx={10} fill={CABIN} />
        <Rect x={238} y={100} width={38} height={5} rx={2.5} fill="#FFFFFF" opacity={0.35} />
        <Rect x={244} y={108} width={26} height={24} rx={5} fill={WINDOW} />
        <Rect x={258} y={108} width={2} height={24} fill={CABIN_DARK} opacity={0.7} />
        <Rect x={274} y={141} width={5} height={7} rx={2} fill="#FFFFFF" opacity={0.6} />

        {/* Wheels */}
        <Circle cx={158} cy={165} r={13} fill={WHEEL} />
        <Circle cx={158} cy={165} r={5.5} fill={HUB} />
        <Circle cx={158} cy={165} r={2} fill="#FFFFFF" opacity={0.6} />
        <Circle cx={252} cy={165} r={13} fill={WHEEL} />
        <Circle cx={252} cy={165} r={5.5} fill={HUB} />
        <Circle cx={252} cy={165} r={2} fill="#FFFFFF" opacity={0.6} />
      </G>
    </Svg>
  );
};