import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import type { AppError } from '../types/api';
import { useAppTheme } from '../theme/useAppTheme';

interface FormNoticeProps {
  message?: string;
  error?: AppError | null;
}

/**
 * Inline notice rendered above the submit button. Shows either a user-friendly
 * server/network error or a neutral informational message.
 */
export const FormNotice = ({ message, error }: FormNoticeProps) => {
  const { colors } = useAppTheme();
  const text = error?.message ?? message;

  if (!text) return null;

  const isError = Boolean(error);
  const background = isError ? colors.errorSoft : colors.successSoft;
  const foreground = isError ? colors.error : colors.success;
  const Icon = isError ? 'alert-circle' : 'checkmark-circle';

  return (
    <View style={[styles.container, { backgroundColor: background, borderRadius: 12 }]}>
      <Ionicons name={Icon} size={18} color={foreground} />
      <Text style={[styles.text, { color: foreground }]}>{text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
});
