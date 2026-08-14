import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface AnimatedHeaderProps {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

/** Auth header with a rounded white circle back button and soft shadow. */
export const AnimatedHeader = ({ title, onBack, right }: AnimatedHeaderProps) => {
  const navigation = useNavigation();
  const { colors, fonts } = useAppTheme();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        style={({ pressed }) => [
          styles.backButton,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.navy} />
      </Pressable>
      {title ? (
        <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.lg }]} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={styles.right}>{right}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 2px 6px rgba(30, 27, 58, 0.06)' }
      : {
          shadowColor: '#1E1B3A',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 6,
          elevation: 2,
        }),
  },
  title: {
    fontWeight: '700',
    marginLeft: 12,
    flex: 1,
  },
  right: {
    minWidth: 42,
    alignItems: 'flex-end',
  },
});
