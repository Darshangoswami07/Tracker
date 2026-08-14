import type { Theme as NavigationTheme } from '@react-navigation/native';
import { fontPrimitives, radii, spacing, type BrandColorTokens } from './palette';

/** Resolved theme mode actually rendered by the app. */
export type ThemeMode = 'light' | 'dark';

export type ThemeColors = BrandColorTokens;

export interface AppTheme {
  mode: ThemeMode;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  fonts: typeof fontPrimitives;
  /** Soft elevation presets shared by cards, inputs and buttons. */
  shadows: {
    sm: object;
    md: object;
    lg: object;
  };
  /** Precomputed navigation theme matching the app theme. */
  navigation: NavigationTheme;
}
