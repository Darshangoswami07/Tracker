import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { DrawerContentScrollView, type DrawerContentComponentProps } from '@react-navigation/drawer';

import { getDrawerMenu, type IoniconName, type DrawerMenuItem } from './drawerMenu';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../hooks/useAuth';
import { useUserStore } from '../store/userStore';
import { useAppTheme } from '../theme/useAppTheme';

const NAVY = '#0F172A';
const INDIGO = '#4A3FD8';

/**
 * Custom DeliveryHub drawer. Renders a role-aware menu that only lists
 * screens present in the role's navigation stack. The active row is derived
 * from the focused screen of the nested role stack wrapped by "Home".
 */
export default function AppDrawerContent(props: DrawerContentComponentProps) {
  const { navigation } = props;
  const { colors, fonts } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const signOut = useAuth().signOut;
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const activeScreen = getActiveScreen(props);

  const role = user?.role ?? 'customer';
  const sections = getDrawerMenu(role);

  const handleConfirmLogout = () => {
    setShowLogoutDialog(false);
    navigation.closeDrawer();
    void signOut();
  };

  const renderItem = (item: DrawerMenuItem) => {
    const isLogout = item.action === 'logout';
    const active = !isLogout && item.screen != null && item.screen === activeScreen;

    const onPress = () => {
      if (isLogout) {
        setShowLogoutDialog(true);
        return;
      }
      if (item.screen) {
        navigation.navigate('Home', {
          screen: item.screen,
          params: item.params,
          initial: false,
        });
        navigation.closeDrawer();
      }
    };

    return (
      <Pressable
        key={item.key}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={item.label}
        style={({ pressed }) => [
          styles.row,
          active && styles.rowActive,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={[styles.rowIcon, { backgroundColor: active ? '#635BFF15' : 'transparent' }]}>
          <Ionicons
            name={item.icon as IoniconName}
            size={20}
            color={isLogout ? '#EF4444' : active ? colors.primary : colors.textSecondary}
          />
        </View>
        <Text
          style={[
            styles.rowLabel,
            { color: isLogout ? '#EF4444' : colors.textPrimary, fontSize: fonts.size.md },
            active && styles.rowLabelActive,
          ]}
        >
          {item.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[NAVY, INDIGO]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Ionicons name="cube" size={24} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandName}>DeliveryHub</Text>
            <View style={styles.rolePill}>
              <Text style={styles.roleText}>{humanizeRole(role)}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.userName} numberOfLines={1}>
          {user?.fullName ?? 'Customer'}
        </Text>
      </LinearGradient>

      <DrawerContentScrollView {...props}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              {section.title ? (
                <Text style={[styles.sectionTitle, { color: colors.textMuted, fontSize: fonts.size.xxs }]}>
                  {section.title.toUpperCase()}
                </Text>
              ) : null}
              {section.items.map(renderItem)}
            </View>
          ))}
        </ScrollView>
      </DrawerContentScrollView>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.version, { color: colors.textMuted, fontSize: fonts.size.xxs }]}>
          DeliveryHub v1.0.0
        </Text>
      </View>

      <ConfirmDialog
        visible={showLogoutDialog}
        title="Logout"
        message="Are you sure you want to logout of your DeliveryHub account?"
        confirmLabel="Logout"
        destructive
        onConfirm={handleConfirmLogout}
        onCancel={() => setShowLogoutDialog(false)}
      />
    </View>
  );
}

/** Reads the focused screen of the nested role stack wrapped by "Home". */
const getActiveScreen = (props: DrawerContentComponentProps): string | undefined => {
  const state = props.navigation.getState();
  const home = state?.routes?.find((route) => route.name === 'Home');
  const nested = home?.state as { routes?: { name: string }[]; index?: number } | undefined;
  return nested?.routes?.[nested.index ?? 0]?.name;
};

const humanizeRole = (role: string): string => role.replace(/_/g, ' ');

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 26,
    paddingBottom: 20,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
  roleText: {
    color: '#E0E7FF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  userName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 14,
  },
  scrollContent: { paddingVertical: 8 },
  section: { marginBottom: 6 },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActive: {
    backgroundColor: '#F3EEFF',
  },
  rowPressed: { opacity: 0.7 },
  rowLabel: { flex: 1, fontWeight: '600' },
  rowLabelActive: { fontWeight: '800' },
  footer: { paddingVertical: 12 },
  version: { textAlign: 'center', fontWeight: '500' },
});
