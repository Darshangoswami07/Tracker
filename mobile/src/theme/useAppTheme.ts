import { createContext, useContext } from 'react';
import type { AppTheme } from './types';

export const ThemeContext = createContext<AppTheme | null>(null);

/** Returns the current resolved theme (colors, spacing, fonts, shadows). */
export const useAppTheme = (): AppTheme => {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useAppTheme must be used within a <AppThemeProvider>.');
  }
  return theme;
};