import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface CheckboxProps {
  checked: boolean;
  onPress: () => void;
  /** Label content; rich text (e.g. accents/links) supported via ReactNode. */
  children: ReactNode;
}

/** Static tap-to-toggle checkbox: solid purple fill + white checkmark. */
export const Checkbox = ({ checked, onPress, children }: CheckboxProps) => {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      style={styles.row}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : colors.background,
          },
        ]}
      >
        {checked ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
      </View>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{children}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  box: {
    width: 20,
    height: 20,
    marginRight: 9,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});