import 'react-native-gesture-handler';
import './src/i18n';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { AppThemeProvider, NavigationContainer } from './src/theme/ThemeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';
import { startupTrace } from './src/utils/startupTrace';

// Marks the point where every static import above this line (gesture-handler,
// i18n, expo-splash-screen, react-query, theme, navigation, and everything
// those transitively pull in) has finished evaluating. Everything before this
// line already ran before `bundle:loaded` is even logged in index.ts, because
// `import App from './App'` there resolves (and fully evaluates this file's
// own import graph) before that mark's statement executes.
startupTrace.mark('App:module-start');

// Keep the native splash visible until the app finishes bootstrapping so the
// animated splash screen can take over seamlessly. Ignored gracefully on web.
SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
    },
    mutations: {
      retry: 0,
    },
  },
});
startupTrace.mark('query:client-created');

export default function App() {
  startupTrace.mark('App:render-start');
  const tree = (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppThemeProvider>
            <NavigationContainer onReady={() => startupTrace.mark('navigation:onReady')}>
              <RootNavigator />
            </NavigationContainer>
          </AppThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
  startupTrace.mark('App:render-end');
  return tree;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});