import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface TextBoxProps extends TextInputProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  rightElement?: ReactNode;
  error?: string;
  onFocusChange?: (focused: boolean) => void;
}

/** Consistent labelled input used across all auth forms. */
export const TextBox = forwardRef<TextInput, TextBoxProps>(
  ({ label, icon, rightElement, error, onFocusChange, onBlur, onFocus, style, ...rest }, ref) => {
    const { colors, radii, spacing, fonts } = useAppTheme();
    const [focused, setFocused] = useState(false);

    const inputStyle = useMemo(() => {
      const borderColor = error
        ? colors.error
        : focused
          ? colors.primary
          : colors.border;
      return {
        borderColor,
        backgroundColor: colors.inputBackground,
        borderRadius: radii.md,
      };
    }, [colors, error, focused, radii]);

    return (
      <View style={styles.container}>
        <Text style={[styles.label, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>
          {label}
        </Text>
        <View style={[styles.inputWrap, inputStyle]}>
          {icon ? (
            <Ionicons
              name={icon}
              size={18}
              color={focused || error ? (error ? colors.error : colors.primary) : colors.textMuted}
              style={styles.icon}
            />
          ) : null}
          <TextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            style={[
              styles.input,
              { color: colors.textPrimary, fontSize: fonts.size.md },
              style,
            ]}
            onFocus={(event) => {
              setFocused(true);
              onFocusChange?.(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onFocusChange?.(false);
              onBlur?.(event);
            }}
            {...rest}
          />
          {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
        </View>
        {error ? (
          <Text style={[styles.error, { color: colors.error, fontSize: fonts.size.xs }]}>
            {error}
          </Text>
        ) : null}
      </View>
    );
  },
);

TextBox.displayName = 'TextBox';

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  icon: {
    marginRight: 10,
  },
  right: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    height: 52,
    paddingVertical: 0,
  },
  error: {
    marginTop: 2,
    fontWeight: '500',
  },
});