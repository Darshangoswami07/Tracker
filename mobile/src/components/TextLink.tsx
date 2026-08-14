import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface TextLinkProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Inline indigo text action; dims softly on press. */
export const TextLink = ({ label, onPress, accessibilityLabel }: TextLinkProps) => {
  const { colors } = useAppTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} accessibilityRole="link">
      <Text
        accessibilityLabel={accessibilityLabel}
        style={[styles.link, { color: colors.primary }]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  link: {
    fontSize: 14,
    fontWeight: '700',
  },
});
