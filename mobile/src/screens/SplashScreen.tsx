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
import { useRegistrationStore } from '../store/registrationStore';
import { useSessionStore } from '../store/sessionStore';
import { useThemeStore } from '../store/themeStore';
import { useSettingsStore } from '../store/settingsStore';
import { useProfileLocalStore } from '../store/profileLocalStore';
import { useAppTheme } from '../theme/useAppTheme';
import { getLogger } from '../utils/logger';
import { withTimeout } from '../utils/withTimeout';

const logger = getLogger('splash');

const MIN_DISPLAY_MS = 1400;
/** Cap per hydration step; startup must never hang on storage. */
const HYDRATE_TIMEOUT_MS = 5000;
/** Cap on server validation; the splash must always leave on failure. */
const SESSION_VALIDATION_TIMEOUT_MS = 15000;

/**
 * Launch screen. Hydrates the persisted stores, validates the stored JWT with
 * the backend and then lets the root navigator decide the destination.
 */
export const SplashScreen = () => {
  const { colors, fonts } = useAppTheme();
  const hydrate = useAuthStore((state) => state.hydrate);
  const validateSession = useAuthStore((state) => state.validateSession);
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

    const run = async () => {
      try {
        await Promise.all([
          withTimeout(hydrateTheme(), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(hydrateSettings(), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(hydrateSession(), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(hydrate(), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(hydrateRegistration(), HYDRATE_TIMEOUT_MS).catch(() => undefined),
          withTimeout(hydrateProfileLocal(), HYDRATE_TIMEOUT_MS).catch(() => undefined),
        ]);
        await withTimeout(validateSession(), SESSION_VALIDATION_TIMEOUT_MS).catch(
          () => undefined,
        );
      } catch (error) {
        logger.warn('[Splash] Bootstrap error', error);
      } finally {
        // Always hide the native splash once the minimum display time has
        // elapsed, even if the store already navigated away (mount is gone) or
        // a non-critical initialisation step failed.
        const elapsed = Date.now() - startedAt;
        const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
        await new Promise((resolve) => setTimeout(resolve, remaining));
        try {
          await ExpoSplashScreen.hideAsync();
        } catch (error) {
          logger.warn('[Splash] Failed to hide native splash', error);
        }
      }
    };

    void run();
  }, [hydrate, hydrateSession, hydrateTheme, hydrateSettings, validateSession, hydrateRegistration]);

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