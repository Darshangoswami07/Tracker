import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoSplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Logo } from '../components/Logo';
import { useAuthStore } from '../store/authStore';
import { useUserStore } from '../store/userStore';
import { useRegistrationStore } from '../store/registrationStore';
import { useSessionStore } from '../store/sessionStore';
import { useThemeStore } from '../store/themeStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProfileLocalStore } from '../store/profileLocalStore';
import { useAppTheme } from '../theme/useAppTheme';
import { getLogger } from '../utils/logger';
import { startupTrace } from '../utils/startupTrace';
import { withTimeout } from '../utils/withTimeout';

const logger = getLogger('splash');

startupTrace.mark('Splash:module-loaded');

/**
 * Tiny floor before hiding the *native* splash, only to avoid a one-frame
 * white flash between the native splash bitmap and the first RN frame. This is
 * NOT a branded-minimum-display timer — the animated JS splash below covers
 * any remaining bootstrap. Was 1400ms (an arbitrary hold that alone put the
 * first visible frame over the <1s budget).
 */
const NATIVE_SPLASH_FLOOR_MS = 150;
/** Cap per hydration step; startup must never hang on storage. */
const HYDRATE_TIMEOUT_MS = 5000;
/** Cap on server validation; the splash must always leave on failure. */
const SESSION_VALIDATION_TIMEOUT_MS = 15000;

/**
 * Launch screen. Hydrates the persisted stores, validates the stored JWT with
 * the backend and then lets the root navigator decide the destination.
 */
export const SplashScreen = () => {
  startupTrace.mark('Splash:render');
  const { colors, fonts } = useAppTheme();
  const hydrate = useAuthStore((state) => state.hydrate);
  const validateSession = useAuthStore((state) => state.validateSession);
  const hydrateUser = useUserStore((state) => state.hydrate);
  const hydrateSession = useSessionStore((state) => state.hydrate);
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const hydrateRegistration = useRegistrationStore((state) => state.hydrate);
  const hydrateProfileLocal = useProfileLocalStore((state) => state.hydrate);

  const dotPulse = useSharedValue(0.5);

  useEffect(() => {
    dotPulse.value = withRepeat(
      withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [dotPulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: dotPulse.value,
  }));

  useEffect(() => {
    const startedAt = Date.now();

    let nativeSplashHidden = false;
    const hideNativeSplash = async () => {
      if (nativeSplashHidden) return;
      nativeSplashHidden = true;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, NATIVE_SPLASH_FLOOR_MS - elapsed);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      try {
        await ExpoSplashScreen.hideAsync();
        startupTrace.mark('nativeSplash:hidden');
      } catch (error) {
        logger.warn('[Splash] Failed to hide native splash', error);
      }
    };

    const run = async () => {
      try {
        startupTrace.mark('splash:hydrations-start');
        // The cached user profile must be loaded BEFORE the auth store
        // hydrates, so `hydrate()` can decide whether an optimistic
        // authenticated restore is possible (token + cached profile ->
        // straight to the app shell, revalidate in the background).
        await withTimeout(startupTrace.measure('hydrate:user', () => hydrateUser()), HYDRATE_TIMEOUT_MS).catch(() => undefined);
        await Promise.all([
          withTimeout(startupTrace.measure('hydrate:theme', () => hydrateTheme()), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(startupTrace.measure('hydrate:settings', () => hydrateSettings()), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(startupTrace.measure('hydrate:session', () => hydrateSession()), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(startupTrace.measure('hydrate:auth', () => hydrate()), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(startupTrace.measure('hydrate:registration', () => hydrateRegistration()), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(startupTrace.measure('hydrate:profileLocal', () => hydrateProfileLocal()), HYDRATE_TIMEOUT_MS).catch(() => undefined),
        ]);
        startupTrace.mark('splash:hydrations-done', {
          status: useAuthStore.getState().status,
        });

        // Local restoration is complete — the root navigator has already
        // switched to the app shell / auth stack. Hide the native splash NOW;
        // never hold it for the network. The remaining (rare) token-only
        // blocking validation runs under the animated JS splash.
        void hideNativeSplash();

        if (useAuthStore.getState().status === 'validating') {
          await withTimeout(validateSession(), SESSION_VALIDATION_TIMEOUT_MS).catch(
            () => undefined,
          );
        }
      } catch (error) {
        logger.warn('[Splash] Bootstrap error', error);
      } finally {
        void hideNativeSplash();
      }
    };

    void run();
  }, [hydrate, hydrateUser, hydrateSession, hydrateTheme, hydrateSettings, validateSession, hydrateRegistration, hydrateProfileLocal]);

  return (
    <LinearGradient
      style={styles.container}
      colors={[
        colors.backgroundGradientTop,
        colors.backgroundGradientMid,
        colors.backgroundGradientBottom,
      ]}
    >
      <Animated.View entering={FadeIn.duration(600)} style={styles.center}>
        <Logo size="lg" />
        <Animated.View entering={FadeInDown.delay(250).duration(600)} style={styles.statusRow}>
          <Animated.View style={[styles.dot, { backgroundColor: colors.primary }, pulseStyle]} />
          <Text style={[styles.status, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
            Securing your session…
          </Text>
        </Animated.View>
      </Animated.View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    gap: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  status: {
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});