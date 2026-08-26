import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Header } from '../../components/Header';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getDrawerMenu, type DrawerMenuItem } from '../../navigation/drawerMenu';
import { useAuth } from '../../hooks/useAuth';
import { useUserStore } from '../../store/userStore';
import { useAppNav } from '../../hooks/useAppNav';
import { useAppTheme } from '../../theme/useAppTheme';

const humanizeRole = (role: string): string => role.replace(/_/g, ' ');

const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

/**
 * Full-screen mobile menu — the tab-shell replacement for the old slide-out
 * drawer. Lists the same role-gated sections as before (via drawerMenu.ts)
 * as tappable rows instead of a sidebar panel.
 */
export const MoreScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const signOut = useAuth().signOut;
  const { navigate } = useAppNav();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const role = user?.role ?? 'admin';
  const sections = getDrawerMenu(role).filter((section) => section.key !== 'main');

  const handleConfirmLogout = () => {
    setShowLogoutDialog(false);
    void signOut();
  };

  const handlePress = (item: DrawerMenuItem) => {
    if (item.action === 'logout') {
      setShowLogoutDialog(true);
      return;
    }
    if (item.screen) {
      navigate(item.screen, item.params);
    }
  };

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Header title={t('common.more')} />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>{initialsOf(user?.fullName ?? '?')}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.userName, { color: colors.textPrimary }]} numberOfLines={1}>
              {user?.fullName ?? t('common.account')}
            </Text>
            <View style={[styles.rolePill, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
              <Text style={[styles.roleText, { color: colors.primary }]}>{humanizeRole(role)}</Text>
            </View>
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            {section.titleKey ? (
              <Text style={[styles.sectionTitle, { color: colors.textMuted, fontSize: fonts.size.xxs }]}>
                {t(section.titleKey).toUpperCase()}
              </Text>
            ) : null}
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
              {section.items.map((item, index) => {
                const isLogout = item.action === 'logout';
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => handlePress(item)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t(item.labelKey)}
                    style={[
                      styles.row,
                      index < section.items.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: isLogout ? `${colors.error}15` : colors.surfaceMuted, borderRadius: radii.md }]}>
                      <Ionicons name={item.icon} size={20} color={isLogout ? colors.error : colors.textSecondary} />
                    </View>
                    <Text style={[styles.rowLabel, { color: isLogout ? colors.error : colors.textPrimary, fontSize: fonts.size.md }]}>
                      {t(item.labelKey)}
                    </Text>
                    {!isLogout && <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        <Text style={[styles.version, { color: colors.textMuted, fontSize: fonts.size.xxs }]}>DeliveryHub v1.0.0</Text>
      </ScrollView>

      <ConfirmDialog
        visible={showLogoutDialog}
        title={t('navigation.logout')}
        message={t('settings.signOutConfirm')}
        confirmLabel={t('navigation.logout')}
        destructive
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </SafeAreaView>
  );
};

const createStyles = ({
  spacing,
  fonts,
}: {
  colors: ReturnType<typeof useAppTheme>['colors'];
  spacing: ReturnType<typeof useAppTheme>['spacing'];
  radii: ReturnType<typeof useAppTheme>['radii'];
  fonts: ReturnType<typeof useAppTheme>['fonts'];
  shadows: ReturnType<typeof useAppTheme>['shadows'];
}) =>
  StyleSheet.create({
    safe: { flex: 1 },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.huge, gap: spacing.lg },
    profileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
    avatar: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: fonts.size.lg, fontWeight: '800' },
    userName: { fontSize: fonts.size.lg, fontWeight: '800' },
    rolePill: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 10, paddingVertical: 2 },
    roleText: { fontSize: fonts.size.xxs, fontWeight: '700', textTransform: 'capitalize', letterSpacing: 0.3 },
    section: { gap: spacing.sm },
    sectionTitle: { fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: spacing.xs },
    card: { overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
    rowIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, fontWeight: '600' },
    version: { textAlign: 'center', fontWeight: '500', marginTop: spacing.sm },
  });

export default MoreScreen;
