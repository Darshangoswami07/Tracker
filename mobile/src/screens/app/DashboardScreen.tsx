import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../../components/AppButton';
import { useAuth } from '../../hooks/useAuth';
import { useUserStore } from '../../store/userStore';
import { useAppTheme } from '../../theme/useAppTheme';
import { formatNameInitials } from '../../utils/format';

interface Module {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const UPCOMING_MODULES: Module[] = [
  { key: 'shipments', label: 'Shipments', icon: 'cube-outline' },
  { key: 'drivers', label: 'Drivers', icon: 'people-outline' },
  { key: 'routes', label: 'Routes', icon: 'map-outline' },
  { key: 'tracking', label: 'Tracking', icon: 'navigate-outline' },
  { key: 'scanning', label: 'Scanning', icon: 'qr-code-outline' },
  { key: 'reports', label: 'Reports', icon: 'bar-chart-outline' },
];

/**
 * Placeholder dashboard shown after authentication. Confirms the session is
 * alive and previews the modules arriving in later phases.
 */
export const DashboardScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const signOut = useAuth().signOut;

  const greeting = `Hello, ${user?.fullName?.split(' ')[0] ?? 'there'}`;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.xl }]}>
            {greeting}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
            Your logistics workspace
          </Text>
        </View>
        <View
          style={[
            styles.avatar,
            { backgroundColor: colors.primary, borderRadius: radii.pill },
          ]}
        >
          <Text style={[styles.avatarText, { color: colors.onPrimary, fontSize: fonts.size.md }]}>
            {formatNameInitials(user?.fullName ?? 'DH')}
          </Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg }, shadows.md]}>
        <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: fonts.size.md }]}>
          Module Library
        </Text>
        <Text style={[styles.cardSubtitle, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
          These capabilities arrive in upcoming phases.
        </Text>
        <View style={styles.grid}>
          {UPCOMING_MODULES.map((module) => (
            <View
              key={module.key}
              style={[
                styles.module,
                { backgroundColor: colors.surfaceMuted, borderRadius: radii.md },
              ]}
            >
              <View
                style={[styles.moduleIcon, { backgroundColor: colors.primarySoft, borderRadius: radii.sm }]}
              >
                <Ionicons name={module.icon} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.moduleLabel, { color: colors.textSecondary, fontSize: fonts.size.xs }]}>
                {module.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      <AppButton label="Sign Out" variant="outline" onPress={() => void signOut()} />
      <View style={{ height: spacing.md }} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 24,
  },
  headerText: {
    gap: 4,
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontWeight: '500',
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '700',
  },
  card: {
    padding: 20,
  },
  cardTitle: {
    fontWeight: '800',
  },
  cardSubtitle: {
    marginTop: 4,
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  module: {
    width: '31%',
    padding: 14,
    gap: 10,
    alignItems: 'center',
  },
  moduleIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleLabel: {
    fontWeight: '600',
    textAlign: 'center',
  },
});