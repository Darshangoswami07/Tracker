import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuth } from '../../hooks/useAuth';
import { PrimaryButton } from '../../components/PrimaryButton';

/**
 * Shown when an authenticated user's role has no mobile app experience
 * (e.g. an account created by an admin for internal records only). Only
 * admin/super_admin have a dashboard in this app.
 */
export const UnsupportedRoleScreen = () => {
  const { colors, spacing } = useAppTheme();
  const { signOut } = useAuth();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <Ionicons name="lock-closed-outline" size={48} color={colors.textMuted} />
      <View style={{ height: spacing.lg }} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>Account not available here</Text>
      <View style={{ height: spacing.sm }} />
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        This account type doesn't have access to the DeliveryHub app. Please contact your administrator.
      </Text>
      <View style={{ height: spacing.xl }} />
      <PrimaryButton label="Logout" onPress={() => void signOut()} showArrow={false} />
    </SafeAreaView>
  );
};

export default UnsupportedRoleScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
