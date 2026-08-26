import { ComponentProps } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../theme/useAppTheme';
import { useSettingsStore, type LanguageCode } from '../store/settingsStore';

const LANGUAGE_OPTIONS: { value: LanguageCode; label: string; displayName: string; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'en', label: 'English', displayName: 'English', icon: 'globe-outline' },
  { value: 'hi', label: 'हिन्दी', displayName: 'हिन्दी', icon: 'globe-outline' },
  { value: 'hinglish', label: 'Hinglish', displayName: 'Hinglish', icon: 'globe-outline' },
];

interface LanguagePickerModalProps {
  visible: boolean;
  onClose: () => void;
}

export const LanguagePickerModal = ({ visible, onClose }: LanguagePickerModalProps) => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const styles = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxxl,
      ...shadows.lg,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, alignSelf: 'center', marginBottom: spacing.lg },
    title: { fontSize: fonts.size.lg, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
      gap: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
    optionLabel: { fontSize: fonts.size.md, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    optionDisplayName: { fontSize: fonts.size.xs, fontWeight: '500', color: colors.textSecondary, marginTop: 2 },
  });

  const handleSelect = (value: LanguageCode) => {
    setLanguage(value);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={styles.sheet}
        >
          <View style={styles.handle} />
          <Text style={styles.title}>{t('settings.chooseLanguage')}</Text>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = language === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={styles.option}
                onPress={() => handleSelect(option.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={option.displayName}
              >
                <View style={[styles.optionIcon, { backgroundColor: selected ? `${colors.primary}15` : colors.surfaceMuted }]}>
                  <Ionicons name={option.icon} size={22} color={selected ? colors.primary : colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionLabel}>{option.displayName}</Text>
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};
