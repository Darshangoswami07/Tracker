import { DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Platform } from 'react-native';
import { brandColors, darkBrandColors, fontPrimitives, radii, spacing } from './palette';
import type { AppTheme, ThemeColors, ThemeMode } from './types';

type ShadowPresets = { sm: object; md: object; lg: object };

const buildNativeShadows = (color: string): ShadowPresets => ({
  sm: {
    shadowColor: color,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: color,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  lg: {
    shadowColor: color,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
});

const buildWebShadows = (): ShadowPresets => ({
  sm: { boxShadow: '0 2px 6px rgba(0, 0, 0, 0.06)' },
  md: { boxShadow: '0 6px 16px rgba(0, 0, 0, 0.12)' },
  lg: { boxShadow: '0 10px 24px rgba(0, 0, 0, 0.20)' },
});

/**
 * Builds the application theme for a resolved mode. Both light and dark share
 * the same token names, so token-consuming screens adapt without changes.
 */
export const buildTheme = (mode: ThemeMode = 'light'): AppTheme => {
  const isDark = mode === 'dark';
  const colors: ThemeColors = isDark ? darkBrandColors : brandColors;
  const base = isDark ? DarkTheme : DefaultTheme;

  return {
    mode,
    colors,
    spacing,
    radii,
    fonts: fontPrimitives,
    shadows:
      Platform.select<ShadowPresets>({
        web: buildWebShadows(),
        default: buildNativeShadows(colors.shadow),
      }) ?? buildNativeShadows(colors.shadow),
    navigation: {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.textPrimary,
        border: colors.border,
        notification: colors.error,
      },
    },
  };
};
