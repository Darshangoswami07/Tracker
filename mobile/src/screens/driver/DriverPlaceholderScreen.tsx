import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, Text, View } from 'react-native';
import { Header } from '../../components/Header';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';

interface DriverPlaceholderScreenProps {
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const DriverPlaceholderScreen = ({
  title,
  description,
  icon,
}: DriverPlaceholderScreenProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title={title} showBack onBack={goBack} />
      </View>
      <View style={[styles.content, { padding: spacing.lg }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.xl,
              padding: spacing.xl,
              ...shadows.sm,
            },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: `${colors.primary}15`,
                borderRadius: radii.pill,
                marginBottom: spacing.lg,
              },
            ]}
          >
            <Ionicons name={icon} size={32} color={colors.primary} />
          </View>
          <Text
            style={[
              styles.title,
              {
                color: colors.textPrimary,
                fontSize: fonts.size.xl,
                marginBottom: spacing.sm,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.description,
              {
                color: colors.textSecondary,
                fontSize: fonts.size.md,
              },
            ]}
          >
            {description}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    paddingTop: 8,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    lineHeight: 24,
    textAlign: 'center',
  },
});
