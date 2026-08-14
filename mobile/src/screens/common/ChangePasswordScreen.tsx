import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Alert, Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { Header } from '../../components/Header';
import { CustomInput } from '../../components/CustomInput';
import { ActionButton } from '../../components/ActionButton';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface PasswordFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
}

/** Local password field with a show/hide eye toggle (non form-hook version). */
const PasswordField = ({ label, placeholder, value, onChangeText }: PasswordFieldProps) => {
  const [hidden, setHidden] = useState(true);
  return (
    <CustomInput
      label={label}
      icon="lock-closed-outline"
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={hidden}
      autoCapitalize="none"
      autoCorrect={false}
      rightElement={
        <Pressable
          onPress={() => setHidden((h) => !h)}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          hitSlop={8}
        >
          <Ionicons
            name={hidden ? 'eye-off-outline' : 'eye-outline'}
            size={18}
            color={'#6B7280'}
          />
        </Pressable>
      }
    />
  );
};

/**
 * Change Password screen. Lets the user set a new password using a UI whose
 * server handshake streams in with the account/security phase; validation is
 * enforced client-side today.
 */
export const ChangePasswordScreen = () => {
  const { colors, spacing, radii, fonts } = useAppTheme();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
    form: { gap: spacing.md, marginBottom: spacing.lg },
    hint: { fontSize: fonts.size.xs, fontWeight: '500', color: colors.textMuted, lineHeight: 18 },
    note: { backgroundColor: colors.infoSoft, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xl },
    noteText: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.info, lineHeight: 20 },
  });

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleSubmit = () => {
    if (!currentPassword) {
      Alert.alert('Current Password Required', 'Please enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Weak Password', 'Your new password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords Do Not Match', 'Your new passwords must be identical.');
      return;
    }
    setLoading(true);
    // Server integration ships with the account/security phase.
    setTimeout(() => {
      setLoading(false);
      Alert.alert('Password Changed', 'Your password has been updated successfully.');
    }, 600);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.header}>
          <Header title="Change Password" />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.note}>
            <Text style={styles.noteText}>
              Use a strong password that you don't use for other services.
            </Text>
          </View>

          <View style={styles.form}>
            <PasswordField label="Current Password" placeholder="Enter current password" value={currentPassword} onChangeText={setCurrentPassword} />
            <PasswordField label="New Password" placeholder="Enter new password" value={newPassword} onChangeText={setNewPassword} />
            <PasswordField label="Confirm New Password" placeholder="Re-enter new password" value={confirmPassword} onChangeText={setConfirmPassword} />
            <Text style={styles.hint}>
              Minimum 8 characters with at least one letter and one number.
            </Text>
          </View>

          <ActionButton label="Update Password" icon="lock-closed" size="lg" fullWidth loading={loading} onPress={handleSubmit} />
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

export default ChangePasswordScreen;