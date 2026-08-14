import {
  NavigationContainer,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { PropsWithChildren, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { buildTheme } from './index';
import { ThemeContext } from './useAppTheme';
import { useThemeStore } from '../store/themeStore';
import type { ThemeMode } from './types';

/**
 * Provides the application theme (colors, typography, spacing, shadows) and
 * synchronises it with React Navigation's theming. The theme follows the
 * persisted preference (light / dark / system); "system" is resolved against
 * the OS color scheme at render time.
 */
export const AppThemeProvider = ({ children }: PropsWithChildren) => {
  const preference = useThemeStore((state) => state.preference);
  const system = useColorScheme();

  const mode: ThemeMode =
    preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={theme.navigation}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
};

export { NavigationContainer };