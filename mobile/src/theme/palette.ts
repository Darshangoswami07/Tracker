import { Platform } from 'react-native';

/**
 * Centralised brand color system for DeliveryHub.
 *
 * Light and dark palettes share the same token names so every screen that
 * consumes tokens via `useAppTheme()` adapts automatically. Light is matched
 * to the approved UI reference: a pure white canvas, primary purple #635BFF,
 * secondary purple #8A7CFF and very soft lavender washes. Dark uses the same
 * purple identity on deep navy surfaces.
 */

/** The exact set of color tokens every theme must provide. */
export interface BrandColorTokens {
  // --- Brand -------------------------------------------------------------
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  secondary: string;
  accent: string;
  onPrimary: string;

  // --- Surfaces ----------------------------------------------------------
  background: string;
  surface: string;
  surfaceMuted: string;

  // --- Lines -------------------------------------------------------------
  border: string;
  borderStrong: string;

  // --- Text --------------------------------------------------------------
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Deep navy used for premium headings. */
  navy: string;

  // --- Form --------------------------------------------------------------
  inputBackground: string;

  // --- Semantic ----------------------------------------------------------
  success: string;
  successSoft: string;
  error: string;
  errorSoft: string;
  warning: string;
  warningSoft: string;
  info: string;
  infoSoft: string;

  // --- Effects -----------------------------------------------------------
  overlay: string;
  skeleton: string;
  shadow: string;
  /** Light lavender hero banner behind the illustration. */
  heroBackground: string;

  // --- Gradients ---------------------------------------------------------
  /** Primary button gradient (top -> bottom). */
  gradientStart: string;
  gradientEnd: string;
  /** Auth CTA gradient: secondary purple top -> primary purple bottom. */
  gradientButtonStart: string;
  gradientButtonEnd: string;
  backgroundGradientTop: string;
  backgroundGradientMid: string;
  backgroundGradientBottom: string;
}

export const brandColors: BrandColorTokens = {
  // --- Brand -------------------------------------------------------------
  primary: '#635BFF',
  primaryStrong: '#4A3FD8',
  primarySoft: '#F3EEFF',
  secondary: '#8A7CFF',
  accent: '#8A7CFF',
  onPrimary: '#FFFFFF',

  // --- Surfaces ----------------------------------------------------------
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#F5F3FF',

  // --- Lines -------------------------------------------------------------
  border: '#E8EAF5',
  borderStrong: '#D9DDF0',

  // --- Text --------------------------------------------------------------
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  /** Deep navy used for premium headings. */
  navy: '#111827',

  // --- Form --------------------------------------------------------------
  inputBackground: '#FFFFFF',

  // --- Semantic ----------------------------------------------------------
  success: '#10B981',
  successSoft: '#ECFDF5',
  error: '#EF4444',
  errorSoft: '#FEF2F2',
  warning: '#F59E0B',
  warningSoft: '#FFFBEB',
  info: '#3B82F6',
  infoSoft: '#EFF6FF',

  // --- Effects -----------------------------------------------------------
  overlay: 'rgba(17, 24, 39, 0.45)',
  skeleton: '#E8EAF5',
  shadow: '#635BFF',
  /** Light lavender hero banner behind the illustration. */
  heroBackground: '#F3EEFF',

  // --- Gradients ---------------------------------------------------------
  /** Primary button gradient (top -> bottom). */
  gradientStart: '#7B6DFF',
  gradientEnd: '#5B4CF0',
  /** Auth CTA gradient: secondary purple top -> primary purple bottom. */
  gradientButtonStart: '#7B6DFF',
  gradientButtonEnd: '#5B4CF0',
  // Background is a plain white base; the soft lavender glow is layered by the
  // AuthBackground decorative component.
  backgroundGradientTop: '#FFFFFF',
  backgroundGradientMid: '#FFFFFF',
  backgroundGradientBottom: '#FFFFFF',
};

export const darkBrandColors: BrandColorTokens = {
  // --- Brand -------------------------------------------------------------
  primary: '#7C6FFF',
  primaryStrong: '#8A7CFF',
  primarySoft: '#26204A',
  secondary: '#9B8CFF',
  accent: '#9B8CFF',
  onPrimary: '#FFFFFF',

  // --- Surfaces ----------------------------------------------------------
  background: '#0B0B12',
  surface: '#141625',
  surfaceMuted: '#1B1E31',

  // --- Lines -------------------------------------------------------------
  border: '#262B40',
  borderStrong: '#343A55',

  // --- Text --------------------------------------------------------------
  textPrimary: '#F2F3F8',
  textSecondary: '#A7ADC6',
  textMuted: '#6E7491',
  /** Deep navy used for premium headings. */
  navy: '#F2F3F8',

  // --- Form --------------------------------------------------------------
  inputBackground: '#141625',

  // --- Semantic ----------------------------------------------------------
  success: '#34D399',
  successSoft: '#0F2E22',
  error: '#F87171',
  errorSoft: '#3A1216',
  warning: '#FBBF24',
  warningSoft: '#3A2B0B',
  info: '#60A5FA',
  infoSoft: '#10233D',

  // --- Effects -----------------------------------------------------------
  overlay: 'rgba(0, 0, 0, 0.6)',
  skeleton: '#262B40',
  shadow: '#000000',
  /** Dark lavender hero banner behind the illustration. */
  heroBackground: '#1B1E31',

  // --- Gradients ---------------------------------------------------------
  /** Primary button gradient (top -> bottom). */
  gradientStart: '#7B6DFF',
  gradientEnd: '#5B4CF0',
  /** Auth CTA gradient: secondary purple top -> primary purple bottom. */
  gradientButtonStart: '#7B6DFF',
  gradientButtonEnd: '#5B4CF0',
  backgroundGradientTop: '#0B0B12',
  backgroundGradientMid: '#0B0B12',
  backgroundGradientBottom: '#0B0B12',
};

/** Typography primitives shared across the app. */
export const fontPrimitives = {
  family: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'system-ui',
  }),
  size: {
    xxs: 11,
    xs: 12,
    sm: 13,
    md: 15,
    lg: 16,
    xl: 20,
    xxl: 26,
    xxxl: 32,
  },
  weight: {
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    heavy: '800',
  } as const,
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
  /** Auth text fields. */
  input: 16,
  /** Primary / social action buttons. */
  button: 18,
  /** Cards and the logo tile. */
  card: 16,
} as const;
