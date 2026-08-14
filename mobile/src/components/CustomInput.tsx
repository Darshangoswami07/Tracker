import { Ionicons } from '@expo/vector-icons';
import { forwardRef, type ReactNode, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface CustomInputProps extends TextInputProps {
  label?: string;
  /** Leading icon shown inside the field. */
  icon: keyof typeof Ionicons.glyphMap;
  /** Optional trailing element (e.g. the password eye toggle). */
  rightElement?: ReactNode;
  error?: string;
}

/**
 * Auth text field: label above, purple leading icon, soft border that becomes
 * purple on focus, ~50px tall with a 16px radius. Static; the only focus change
 * is the border color.
 */
export const CustomInput = forwardRef<TextInput, CustomInputProps>(
  ({ label, icon, rightElement, error, onBlur, onFocus, style, ...rest }, ref) => {
    const { colors } = useAppTheme();
    const [focused, setFocused] = useState(false);

    const borderColor = error ? colors.error : focused ? colors.primary : colors.border;
    const borderWidth = focused ? 1.5 : 1;
    const iconColor = error ? colors.error : colors.primary;

    return (
      <View style={styles.container}>
        {label ? (
          <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
        ) : null}
        <View
          style={[
            styles.field,
            styles.shadow,
            {
              backgroundColor: colors.inputBackground,
              borderRadius: 16,
              borderColor,
              borderWidth,
              ...(Platform.OS === 'web'
                ? { boxShadow: `0 ${focused ? 6 : 3}px ${focused ? 16 : 8}px rgba(99, 91, 255, ${focused ? 0.18 : 0.06})` }
                : {
                    shadowColor: colors.primary,
                    shadowOpacity: focused ? 0.18 : 0.06,
                    shadowRadius: focused ? 16 : 8,
                    shadowOffset: { width: 0, height: focused ? 6 : 3 },
                    elevation: focused ? 4 : 1,
                  }),
            },
          ]}
        >
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={18} color={iconColor} />
          </View>
          <TextInput
            ref={ref}
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            style={[styles.input, { color: colors.textPrimary, fontSize: 15 }, style]}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            {...rest}
          />
          {rightElement ? <View style={styles.rightWrap}>{rightElement}</View> : null}
        </View>
        {error ? (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        ) : null}
      </View>
    );
  },
);

CustomInput.displayName = 'CustomInput';

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  shadow: {
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 3px 8px rgba(99, 91, 255, 0.06)' }
      : {
          shadowColor: '#635BFF',
          shadowOpacity: 0.06,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 1,
        }),
  },
  iconWrap: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    includeFontPadding: false,
  },
  rightWrap: {
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 11,
    marginLeft: 2,
    marginTop: 1,
    fontWeight: '500',
  },
});