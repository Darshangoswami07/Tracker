import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  showArrow?: boolean;
}

/** Primary CTA: full-width purple-gradient button with a white right arrow. */
export const PrimaryButton = ({
  label,
  onPress,
  loading = false,
  disabled = false,
  showArrow = true,
}: PrimaryButtonProps) => {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.shadow,
        {
          opacity: isDisabled ? 0.55 : pressed ? 0.94 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <LinearGradient
        style={styles.button}
        colors={[colors.gradientButtonStart, colors.gradientButtonEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.row}>
          {loading ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <>
              <Text style={[styles.label, { color: colors.onPrimary }]}>{label}</Text>
              {showArrow ? (
                <View style={styles.arrow}>
                  <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
                </View>
              ) : null}
            </>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 18,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 18px rgba(91, 76, 240, 0.22)' }
      : {
          shadowColor: '#5B4CF0',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 5,
        }),
  },
  button: {
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  arrow: {
    marginLeft: 9,
  },
});