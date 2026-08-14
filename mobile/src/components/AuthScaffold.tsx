import { LinearGradient } from 'expo-linear-gradient';
import { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AuthBackground } from './AuthBackground';
import { useAppTheme } from '../theme/useAppTheme';

interface AuthScaffoldProps extends PropsWithChildren {
  keyboardOffset?: number;
  /** Full-bleed block rendered above the content column (e.g. the hero). */
  hero?: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Shared layout for auth screens: white base with a soft lavender radial glow
 * and bottom decorative waves, safe areas, keyboard avoidance and a
 * horizontally constrained content column. An optional `hero` renders edge
 * to edge across the full viewport, outside the padded column. The whole
 * screen fades in subtly on mount — the only animation on the auth screens.
 */
export const AuthScaffold = ({ children, hero, footer, keyboardOffset = 60 }: AuthScaffoldProps) => {
  const { colors } = useAppTheme();

  return (
    <View style={styles.flex}>
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={[colors.backgroundGradientTop, colors.backgroundGradientMid, colors.backgroundGradientBottom]}
      />
      <AuthBackground />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={keyboardOffset}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View entering={FadeIn.duration(450)} style={styles.fade}>
              {hero ? <View style={styles.hero}>{hero}</View> : null}
              <View style={styles.content}>
                {children}
                {footer}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  fade: {
    width: '100%',
  },
  hero: {
    width: '100%',
    alignSelf: 'stretch',
  },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
});
