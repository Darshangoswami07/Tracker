import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import { useUserStore } from '../../store/userStore';
import { useProfileLocalStore } from '../../store/profileLocalStore';
import { useAppNav } from '../../hooks/useAppNav';
import { Header } from '../../components/Header';
import { CustomInput } from '../../components/CustomInput';
import { ActionButton } from '../../components/ActionButton';

const validateName = (value: string): string | undefined => (value.trim() ? undefined : 'Name is required');
const validatePhone = (value: string): string | undefined =>
  /^\+?[0-9\s-]{7,15}$/.test(value.trim()) ? undefined : 'Enter a valid phone number';

/**
 * Edit Profile. There is no backend endpoint to update the logged-in user's
 * name/email/phone (`GET /users/me` is read-only), so edits are saved
 * on-device only — same precedent as `settingsStore.ts` — and layered as
 * display overrides on top of the real account data via `profileLocalStore`.
 */
export const EditProfileScreen = () => {
  const { colors, spacing, radii, fonts } = useAppTheme();
  const user = useUserStore((state) => state.user);
  const nameOverride = useProfileLocalStore((state) => state.nameOverride);
  const phoneOverride = useProfileLocalStore((state) => state.phoneOverride);
  const setOverrides = useProfileLocalStore((state) => state.setOverrides);
  const { goBack } = useAppNav();

  const [name, setName] = useState(nameOverride ?? user?.fullName ?? '');
  const [phone, setPhone] = useState(phoneOverride ?? user?.phone ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: spacing.huge, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    note: { flexDirection: 'row', gap: 8, backgroundColor: colors.infoSoft, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl },
    noteText: { flex: 1, fontSize: fonts.size.sm, fontWeight: '500', color: colors.info, lineHeight: 20 },
    form: { gap: spacing.md, marginBottom: spacing.xl },
  });

  const handleSave = () => {
    const nameErr = validateName(name);
    const phoneErr = validatePhone(phone);
    setErrors({ name: nameErr, phone: phoneErr });
    if (nameErr || phoneErr) return;

    setSaving(true);
    // Email isn't editable — always saved as the real account email.
    setOverrides({ name: name.trim(), email: user?.email ?? '', phone: phone.trim() });
    // No network call — this is a local-only save (see file doc comment).
    // The brief delay just keeps the Save affordance consistent with the
    // rest of the app rather than feeling instantaneous/broken.
    setTimeout(() => {
      setSaving(false);
      Alert.alert('Saved', 'Your profile has been updated on this device.', [{ text: 'OK', onPress: goBack }]);
    }, 400);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title="Edit Profile" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.note}>
          <Text style={styles.noteText}>
            Saved on this device only — there&apos;s no account-sync yet, so other admins won&apos;t see these changes.
          </Text>
        </View>

        <View style={styles.form}>
          <CustomInput label="Full Name" icon="person-outline" placeholder="Enter your name" value={name} onChangeText={setName} error={errors.name} />
          <CustomInput
            label="Email"
            icon="mail-outline"
            value={user?.email ?? 'N/A'}
            editable={false}
            selectTextOnFocus={false}
            style={{ opacity: 0.6 }}
          />
          <CustomInput
            label="Phone"
            icon="call-outline"
            placeholder="Enter your phone number"
            value={phone}
            onChangeText={setPhone}
            error={errors.phone}
            keyboardType="phone-pad"
          />
        </View>

        <ActionButton label="Save Changes" icon="checkmark" size="lg" fullWidth loading={saving} onPress={handleSave} />
      </ScrollView>
    </SafeAreaView>
  );
};

export default EditProfileScreen;
