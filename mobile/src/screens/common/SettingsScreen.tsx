import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  Animated,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore, type ThemePreference } from '../../store/themeStore';
import { useSettingsStore, type LanguageCode } from '../../store/settingsStore';
import { Header } from '../../components/Header';
import { ActionButton } from '../../components/ActionButton';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAppNav } from '../../hooks/useAppNav';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'light', label: 'Light', icon: 'sunny-outline' },
  { value: 'dark', label: 'Dark', icon: 'moon-outline' },
  { value: 'system', label: 'System Default', icon: 'phone-portrait-outline' },
];

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: 'English',
  hi: 'Hindi',
  gu: 'Gujarati',
};

export const SettingsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const signOut = useAuthStore((state) => state.clearSession);
  const { goBack, navigate } = useAppNav();
  const systemScheme = useColorScheme();

  const pushNotifications = useSettingsStore((s) => s.pushNotifications);
  const emailNotifications = useSettingsStore((s) => s.emailNotifications);
  const smsNotifications = useSettingsStore((s) => s.smsNotifications);
  const locationAccess = useSettingsStore((s) => s.locationAccess);
  const backgroundRefresh = useSettingsStore((s) => s.backgroundRefresh);
  const dataSaver = useSettingsStore((s) => s.dataSaver);
  const autoDownload = useSettingsStore((s) => s.autoDownload);
  const language = useSettingsStore((s) => s.language);
  const setPushNotifications = useSettingsStore((s) => s.setPushNotifications);
  const setEmailNotifications = useSettingsStore((s) => s.setEmailNotifications);
  const setSmsNotifications = useSettingsStore((s) => s.setSmsNotifications);
  const setLocationAccess = useSettingsStore((s) => s.setLocationAccess);
  const setBackgroundRefresh = useSettingsStore((s) => s.setBackgroundRefresh);
  const setDataSaver = useSettingsStore((s) => s.setDataSaver);
  const setAutoDownload = useSettingsStore((s) => s.setAutoDownload);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [signOutDialogVisible, setSignOutDialogVisible] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  // The effective appearance the user currently sees (resolves "system").
  const darkActive = preference === 'dark' || (preference === 'system' && systemScheme === 'dark');

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.md },
    settingsCard: { overflow: 'hidden' },
    version: { alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border },
    versionText: { fontSize: fonts.size.xs, fontWeight: '500' },
    // Theme selection sheet
    modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    modalSheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxl,
      ...shadows.lg,
    },
    sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.lg },
    sheetTitle: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    themeOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      gap: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    themeOptionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
    themeOptionLabel: { fontSize: fonts.size.md, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    themeOptionDesc: { fontSize: fonts.size.xs, fontWeight: '500', color: colors.textSecondary, marginTop: 2 },
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleConfirmSignOut = () => {
    setSignOutDialogVisible(false);
    signOut();
  };

  const handleContactSupport = () => {
    Alert.alert('Contact Support', `Reach us anytime at:\n\n📧 ${SUPPORT_EMAIL}\n📞 +91 ${SUPPORT_PHONE}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}) },
      { text: 'Email', onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}) },
    ]);
  };

  const handleSelectLanguage = () => {
    Alert.alert('Select Language', 'Choose your preferred language', [
      { text: 'English', onPress: () => setLanguage('en') },
      { text: 'Hindi', onPress: () => setLanguage('hi') },
      { text: 'Gujarati', onPress: () => setLanguage('gu') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const switchColors = { false: colors.borderStrong, true: colors.primary };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title="Settings" leftAction={{ icon: 'chevron-back', onPress: goBack, accessibilityLabel: 'Go back' }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Appearance</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <SettingRow
                icon="sunny-outline"
                label="Theme"
                value={THEME_LABELS[preference]}
                showChevron
                onPress={() => setThemeModalVisible(true)}
              />
              <SettingRow
                icon="contrast-outline"
                label="Dark Mode"
                trailing={
                  <Switch
                    value={darkActive}
                    onValueChange={(value) => setPreference(value ? 'dark' : 'light')}
                    trackColor={switchColors}
                    thumbColor={darkActive ? colors.primary : colors.surface}
                    accessibilityLabel="Dark Mode"
                    accessibilityHint="Toggles between dark and light appearance"
                  />
                }
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Notifications</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <SettingRow
                icon="notifications-outline"
                label="Push Notifications"
                description="Receive push notifications for order updates"
                trailing={
                  <Switch
                    value={pushNotifications}
                    onValueChange={setPushNotifications}
                    trackColor={switchColors}
                    thumbColor={pushNotifications ? colors.primary : colors.surface}
                    accessibilityLabel="Push Notifications"
                    accessibilityHint="Receives push notifications for order updates"
                  />
                }
              />
              <SettingRow
                icon="mail-outline"
                label="Email Notifications"
                description="Receive email notifications"
                trailing={
                  <Switch
                    value={emailNotifications}
                    onValueChange={setEmailNotifications}
                    trackColor={switchColors}
                    thumbColor={emailNotifications ? colors.primary : colors.surface}
                    accessibilityLabel="Email Notifications"
                    accessibilityHint="Receives email notifications"
                  />
                }
              />
              <SettingRow
                icon="chatbubble-outline"
                label="SMS Notifications"
                description="Receive SMS notifications"
                trailing={
                  <Switch
                    value={smsNotifications}
                    onValueChange={setSmsNotifications}
                    trackColor={switchColors}
                    thumbColor={smsNotifications ? colors.primary : colors.surface}
                    accessibilityLabel="SMS Notifications"
                    accessibilityHint="Receives SMS notifications"
                  />
                }
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Privacy & Security</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <SettingRow
                icon="location-outline"
                label="Location Access"
                description="Allow app to access your location for tracking"
                trailing={
                  <Switch
                    value={locationAccess}
                    onValueChange={setLocationAccess}
                    trackColor={switchColors}
                    thumbColor={locationAccess ? colors.primary : colors.surface}
                    accessibilityLabel="Location Access"
                    accessibilityHint="Allows the app to access your location for tracking"
                  />
                }
              />
              <SettingRow
                icon="refresh-outline"
                label="Background App Refresh"
                description="Update data in background"
                trailing={
                  <Switch
                    value={backgroundRefresh}
                    onValueChange={setBackgroundRefresh}
                    trackColor={switchColors}
                    thumbColor={backgroundRefresh ? colors.primary : colors.surface}
                    accessibilityLabel="Background App Refresh"
                    accessibilityHint="Updates data in the background"
                  />
                }
              />
              <SettingRow
                icon="shield-outline"
                label="Data Saver Mode"
                description="Reduce data usage"
                trailing={
                  <Switch
                    value={dataSaver}
                    onValueChange={setDataSaver}
                    trackColor={switchColors}
                    thumbColor={dataSaver ? colors.primary : colors.surface}
                    accessibilityLabel="Data Saver Mode"
                    accessibilityHint="Reduces data usage"
                  />
                }
              />
              <SettingRow
                icon="download-outline"
                label="Auto-download Media"
                description="Automatically download images on WiFi"
                trailing={
                  <Switch
                    value={autoDownload}
                    onValueChange={setAutoDownload}
                    trackColor={switchColors}
                    thumbColor={autoDownload ? colors.primary : colors.surface}
                    accessibilityLabel="Auto-download Media"
                    accessibilityHint="Automatically downloads images on WiFi"
                  />
                }
              />
              <SettingRow
                icon="lock-closed-outline"
                label="Change Password"
                showChevron
                onPress={() => navigate('ChangePassword')}
              />
              <SettingRow
                icon="shield-checkmark-outline"
                label="Two-Factor Authentication"
                showChevron
                onPress={() => Alert.alert('Two-Factor Authentication', 'Two-factor authentication is coming soon.')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Language</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <SettingRow
                icon="language-outline"
                label="App Language"
                value={LANGUAGE_LABELS[language]}
                showChevron
                onPress={handleSelectLanguage}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>About</Text>
            <View style={[styles.settingsCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <SettingRow icon="information-circle-outline" label="Version" value="1.0.0" />
              <SettingRow
                icon="document-text-outline"
                label="Terms of Service"
                showChevron
                onPress={() =>
                  Linking.openURL('https://deliveryhub.app/terms').catch(() => Alert.alert('Terms of Service', 'Terms of Service\n\nUpdated January 1, 2025'))
                }
              />
              <SettingRow
                icon="shield-outline"
                label="Privacy Policy"
                showChevron
                onPress={() =>
                  Linking.openURL('https://deliveryhub.app/privacy').catch(() => Alert.alert('Privacy Policy', 'Privacy Policy\n\nYour privacy matters to us.'))
                }
              />
              <SettingRow
                icon="help-outline"
                label="Help & Support"
                description={`${SUPPORT_EMAIL} • +91 ${SUPPORT_PHONE}`}
                showChevron
                onPress={handleContactSupport}
              />
              <SettingRow
                icon="star-outline"
                label="Rate App"
                showChevron
                onPress={() => Alert.alert('Rate App', 'We would love your feedback! You can rate DeliveryHub on the App Store and Google Play.')}
              />
              <SettingRow
                icon="share-outline"
                label="Share App"
                showChevron
                onPress={() => Alert.alert('Share App', 'Share DeliveryHub with your friends and family using the share sheet.')}
              />
            </View>
          </View>

          <View style={styles.section}>
            <ActionButton
              label="Sign Out"
              icon="log-out"
              variant="danger"
              size="lg"
              fullWidth
              onPress={() => setSignOutDialogVisible(true)}
            />
          </View>

          <View style={styles.version}>
            <Text style={[styles.versionText, { color: colors.textMuted }]}>DeliveryHub v1.0.0 • Build 100</Text>
          </View>
        </Animated.View>
      </ScrollView>

      <Modal
        visible={themeModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setThemeModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setThemeModalVisible(false)}
          accessibilityRole="button"
          accessibilityLabel="Close theme picker"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => {}}
            style={styles.modalSheet}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Theme</Text>
            {THEME_OPTIONS.map((option) => {
              const selected = preference === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.themeOption}
                  onPress={() => {
                    setPreference(option.value);
                    setThemeModalVisible(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                >
                  <View style={[styles.themeOptionIcon, { backgroundColor: selected ? `${colors.primary}15` : colors.surfaceMuted }]}>
                    <Ionicons name={option.icon} size={22} color={selected ? colors.primary : colors.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.themeOptionLabel}>{option.label}</Text>
                    {option.value === 'system' && (
                      <Text style={styles.themeOptionDesc}>Follow your device appearance</Text>
                    )}
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ConfirmDialog
        visible={signOutDialogVisible}
        title="Sign Out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign Out"
        destructive
        onConfirm={handleConfirmSignOut}
        onCancel={() => setSignOutDialogVisible(false)}
      />
    </SafeAreaView>
  );
};

const SettingRow = ({
  icon,
  label,
  description,
  value,
  trailing,
  showChevron = false,
  onPress,
  destructive = false,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  description?: string;
  value?: string;
  trailing?: React.ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
  destructive?: boolean;
}) => {
  const { colors, radii, fonts } = useAppTheme();
  const rowStyles = StyleSheet.create({
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
    iconContainer: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    labelContainer: { flex: 1, gap: 2 },
    label: { fontSize: fonts.size.md, fontWeight: '600' },
    description: { fontSize: fonts.size.sm, fontWeight: '500' },
    trailingContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    value: { fontSize: fonts.size.md, fontWeight: '500' },
  });

  return (
    <TouchableOpacity
      style={[rowStyles.settingRow]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={!onPress && !trailing}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? label : undefined}
    >
      <View style={[rowStyles.iconContainer, { backgroundColor: destructive ? '#EF444415' : `${colors.primary}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={22} color={destructive ? '#EF4444' : colors.primary} />
      </View>
      <View style={rowStyles.labelContainer}>
        <Text style={[rowStyles.label, { color: destructive ? '#EF4444' : colors.textPrimary }]}>{label}</Text>
        {description && <Text style={[rowStyles.description, { color: colors.textSecondary }]}>{description}</Text>}
      </View>
      <View style={rowStyles.trailingContainer}>
        {trailing}
        {value && <Text style={[rowStyles.value, { color: colors.textMuted }]}>{value}</Text>}
        {showChevron && <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
      </View>
    </TouchableOpacity>
  );
};

export default SettingsScreen;