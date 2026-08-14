import { useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Animated, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/authStore';
import { useUserStore } from '../../store/userStore';
import { Header } from '../../components/Header';
import { ActionButton } from '../../components/ActionButton';
import { formatDateTime } from '../../utils/format';
import * as ImagePicker from 'expo-image-picker';

const SUPPORT_EMAIL = 'jobpilotdesk@gmail.com';
const SUPPORT_PHONE = '7456849590';

export const ProfileScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const signOut = useAuthStore((state) => state.clearSession);
  const navigation = useNavigation();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    profileHeader: { alignItems: 'center', gap: 16, marginBottom: spacing.xl, paddingTop: spacing.lg },
    avatarContainer: { position: 'relative' },
    avatar: { width: 100, height: 100, borderRadius: 50 },
    avatarPlaceholder: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontWeight: '800' },
    cameraBtn: { position: 'absolute', bottom: 0, right: 0, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
    profileInfo: { alignItems: 'center', gap: 8 },
    name: { fontSize: fonts.size.xl, fontWeight: '800' },
    roleBadge: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#635BFF15', borderRadius: radii.pill },
    roleText: { fontSize: fonts.size.sm, fontWeight: '700' },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    contactText: { fontSize: fonts.size.sm, fontWeight: '500' },
    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.md },
    infoCard: { padding: 4 },
    actionsList: { gap: 0 },
    version: { alignItems: 'center', paddingVertical: spacing.xl, marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    versionText: { fontSize: fonts.size.xs, fontWeight: '500' },
  });

  const [avatar, setAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Gallery permission is required to select photos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
      // In real app, upload to server
    }
  };

  const takeAvatar = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setAvatar(result.assets[0].uri);
    }
  };

  const handleContactSupport = () => {
    Alert.alert('Contact Support', `Reach us anytime at:\n\n📧 ${SUPPORT_EMAIL}\n📞 +91 ${SUPPORT_PHONE}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Call', onPress: () => Linking.openURL(`tel:${SUPPORT_PHONE}`).catch(() => {}) },
      { text: 'Email', onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {}) },
    ]);
  };

  const handleEditProfile = () => Alert.alert('Edit Profile', 'Editing your profile details is coming soon.');
  const handleNotificationSettings = () => Alert.alert('Notification Settings', 'Manage your notification preferences here soon.');
  const handleLanguage = () => Alert.alert('Language', 'Language selection is coming soon.');
  const handleSecurity = () => Alert.alert('Security & Privacy', 'Security and privacy settings are coming soon.');
  const handleAbout = () => Alert.alert('About', 'DeliveryHub\nVersion 1.0.0\nA complete logistics and delivery management platform.');

  const showAvatarOptions = () => {
    Alert.alert('Update Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takeAvatar },
      { text: 'Choose from Gallery', onPress: pickAvatar },
      { text: 'Remove Photo', onPress: () => setAvatar(null), style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => { signOut(); } },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View style={styles.header}>
          <Header title="Profile" leftAction={{ icon: 'chevron-back', onPress: () => navigation.goBack() }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <View style={styles.profileHeader}>
              <TouchableOpacity style={styles.avatarContainer} onPress={showAvatarOptions} activeOpacity={0.8}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : user?.profileImage ? (
                  <Image source={{ uri: user.profileImage }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primarySoft, borderRadius: radii.pill }]}>
                    <Text style={[styles.avatarText, { color: colors.primary, fontSize: fonts.size.xxxl }]}>
                      {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                    </Text>
                  </View>
                )}
                <View style={[styles.cameraBtn, { backgroundColor: colors.primary, borderRadius: radii.pill }]}>
                  <Ionicons name="camera" size={20} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
              <View style={styles.profileInfo}>
                <Text style={[styles.name, { color: colors.textPrimary }]}>{user?.fullName || 'User'}</Text>
                <View style={styles.roleBadge}>
                  <Text style={[styles.roleText, { color: '#635BFF' }]}>{user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Employee'}</Text>
                </View>
                <View style={styles.contactRow}>
                  <Ionicons name="mail-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.contactText, { color: colors.textSecondary }]}>{user?.email || 'N/A'}</Text>
                </View>
                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={16} color={colors.textMuted} />
                  <Text style={[styles.contactText, { color: colors.textSecondary }]}>{user?.phone || 'N/A'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Account Information</Text>
              <View style={[styles.infoCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <InfoRow icon="id-card-outline" label="User ID" value={user?.id?.slice(0, 8) + '...' || 'N/A'} color="#635BFF" />
                <InfoRow icon="calendar-outline" label="Joined" value={user?.createdAt ? formatDateTime(user.createdAt).split(',')[0] : 'N/A'} color="#06B6D4" />
                <InfoRow icon="shield-outline" label="Status" value={user?.isActive ? 'Active' : 'Inactive'} color={user?.isActive ? '#10B981' : '#EF4444'} />
                <InfoRow icon="lock-closed-outline" label="Verified" value={user?.isActive ? 'Yes' : 'No'} color={user?.isActive ? '#10B981' : '#F59E0B'} />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
              <View style={styles.actionsList}>
                <ActionItem icon="person-outline" label="Edit Profile" onPress={handleEditProfile} color="#635BFF" />
                <ActionItem icon="lock-closed-outline" label="Change Password" onPress={() => navigation.navigate('ChangePassword' as never)} color="#8B5CF6" />
                <ActionItem icon="notifications-outline" label="Notification Settings" onPress={handleNotificationSettings} color="#06B6D4" />
                <ActionItem icon="language-outline" label="Language" onPress={handleLanguage} color="#F97316" />
                <ActionItem icon="shield-outline" label="Security & Privacy" onPress={handleSecurity} color="#EF4444" />
                <ActionItem icon="help-outline" label="Help & Support" onPress={handleContactSupport} color="#10B981" />
                <ActionItem icon="information-circle-outline" label="About" onPress={handleAbout} color="#6B7280" />
              </View>
            </View>

            <View style={styles.section}>
              <ActionButton
                label="Sign Out"
                icon="log-out"
                variant="danger"
                size="lg"
                fullWidth
                onPress={handleSignOut}
              />
            </View>

            <View style={styles.version}>
              <Text style={[styles.versionText, { color: colors.textMuted }]}>DeliveryHub v1.0.0</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

const InfoRow = ({ icon, label, value, color }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string; color: string }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const infoStyles = StyleSheet.create({
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    infoIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    infoText: { flex: 1, gap: 2 },
    infoLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoValue: { fontWeight: '600' },
  });
  return (
    <View style={[infoStyles.infoRow, { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}>
      <View style={[infoStyles.infoIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={infoStyles.infoText}>
        <Text style={[infoStyles.infoLabel, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{label}</Text>
        <Text style={[infoStyles.infoValue, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{value}</Text>
      </View>
    </View>
  );
};

const ActionItem = ({ icon, label, onPress, color }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; color: string }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const itemStyles = StyleSheet.create({
    actionItem: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: colors.surface, borderRadius: radii.lg, marginBottom: spacing.sm, ...shadows.sm },
    actionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { flex: 1, fontSize: fonts.size.md, fontWeight: '600' },
  });
  return (
    <TouchableOpacity style={itemStyles.actionItem} onPress={onPress} activeOpacity={0.8}>
      <View style={[itemStyles.actionIcon, { backgroundColor: `${color}15`, borderRadius: radii.md }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={[itemStyles.actionLabel, { color: colors.textPrimary }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
};

export default ProfileScreen;