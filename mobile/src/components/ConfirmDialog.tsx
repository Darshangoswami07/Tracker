import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Cross-platform confirmation dialog. Uses the native `Modal` so it renders on
 * iOS, Android and web alike (unlike `Alert.alert`, which is a no-op on web).
 */
export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const { colors, radii, fonts, shadows } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss dialog" />
        <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.lg }]}>
          <Text
            style={[
              styles.title,
              { color: colors.textPrimary, fontSize: fonts.size.xl, fontFamily: fonts.family },
            ]}
          >
            {title}
          </Text>
          <Text
            style={[
              styles.message,
              { color: colors.textSecondary, fontSize: fonts.size.md, fontFamily: fonts.family },
            ]}
          >
            {message}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                { borderColor: colors.borderStrong },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
            >
              <Text
                style={[
                  styles.buttonLabel,
                  { color: colors.textPrimary, fontSize: fonts.size.md, fontFamily: fonts.family },
                ]}
              >
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                { backgroundColor: destructive ? colors.error : colors.primary },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
            >
              <Text
                style={[
                  styles.buttonLabel,
                  { color: colors.onPrimary, fontSize: fonts.size.md, fontFamily: fonts.family },
                ]}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
  },
  title: { fontWeight: '800' },
  message: {
    marginTop: 12,
    fontWeight: '500',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  button: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {},
  buttonLabel: { fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
