import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

type Provider = 'google' | 'apple';

interface SocialButtonProps {
  provider: Provider;
  onPress?: () => void;
  /** When false the button stretches to fill its row (side-by-side usage). */
  flex?: boolean;
}

const PROVIDERS: Record<Provider, { label: string; icon: 'google' | 'apple' }> = {
  google: { label: 'Google', icon: 'google' },
  apple: { label: 'Apple', icon: 'apple' },
};

/** Outlined white card with the provider glyph + short label. Static. */
export const SocialButton = ({ provider, onPress, flex = true }: SocialButtonProps) => {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={PROVIDERS[provider].label}
      style={({ pressed }) => [
        styles.button,
        styles.shadow,
        flex ? styles.stretch : styles.fill,
        {
          backgroundColor: colors.inputBackground,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {provider === 'google' ? (
        <FontAwesome5 name="google" size={16} color={colors.textPrimary} />
      ) : (
        <Ionicons name="logo-apple" size={18} color={colors.textPrimary} />
      )}
      <Text style={[styles.label, { color: colors.textPrimary }]}>
        {PROVIDERS[provider].label}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 16,
  },
  shadow: {
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 5px 12px rgba(99, 91, 255, 0.1)' }
      : {
          shadowColor: '#635BFF',
          shadowOffset: { width: 0, height: 5 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 2,
        }),
  },
  stretch: {
    alignSelf: 'stretch',
  },
  fill: {
    flex: 1,
  },
  label: {
    marginLeft: 9,
    fontSize: 15,
    fontWeight: '600',
  },
});