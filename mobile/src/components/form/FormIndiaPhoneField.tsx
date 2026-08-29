import { Ionicons } from '@expo/vector-icons';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

const COUNTRY_CODE = '+91';
const PHONE_LENGTH = 10;
const INDIAN_PHONE_RE = /^[6-9][0-9]{9}$/;

/** Strip everything except digits and clamp to 10 digits. Also handles a
 * pasted/autofilled "+91" or "91" country-code prefix so the 10-digit mobile
 * number is what ends up in the field. */
export function sanitizeIndianPhone(text: string): string {
  let digits = text.replace(/\D/g, '');
  // "+91" + 10 digits => 12 digits starting with "91": drop the leading code.
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits.slice(0, PHONE_LENGTH);
}

/** Validate an Indian mobile number: exactly 10 digits, starting with 6-9. */
export function isValidIndianPhone(value: string): boolean {
  return INDIAN_PHONE_RE.test(value);
}

/** Normalize a 10-digit Indian mobile number into E.164-ish "+91XXXXXXXXXX". */
export function normalizeIndianPhone(value: string): string {
  return `${COUNTRY_CODE}${sanitizeIndianPhone(value)}`;
}

interface FormIndiaPhoneFieldProps<T extends FieldValues> {
  control: Control<T, any, T>;
  name: FieldPath<T>;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder?: string;
  returnKeyType?: 'next' | 'done' | 'go';
}

/**
 * Auth phone field for Indian mobile numbers.
 *
 * Shows a fixed, non-editable "+91" country code followed by a numeric-only
 * input capped at 10 digits. Letters, spaces, symbols and emoji are rejected on
 * typing, paste and autofill. The form value stores the raw 10 digits; callers
 * should normalize with {@link normalizeIndianPhone} before sending.
 *
 * Visual styling (label, icon, 16px rounded field, focus/shadow, inline error)
 * mirrors {@link CustomInput} so the form keeps its existing look.
 */
export function FormIndiaPhoneField<T extends FieldValues>({
  control,
  name,
  label,
  icon,
  placeholder,
  returnKeyType = 'next',
}: FormIndiaPhoneFieldProps<T>) {
  const { colors } = useAppTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value, ref }, fieldState }) => {
        const error = fieldState.error?.message;
        const borderColor = error ? colors.error : focused ? colors.primary : colors.border;
        const borderWidth = focused ? 1.5 : 1;
        const iconColor = error ? colors.error : colors.primary;

        return (
          <View style={styles.container}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
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
                    ? {
                        boxShadow: `0 ${focused ? 6 : 3}px ${
                          focused ? 16 : 8
                        }px rgba(99, 91, 255, ${focused ? 0.18 : 0.06})`,
                      }
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
              <View style={[styles.prefix, { borderColor: colors.border }]}>
                <Text style={[styles.prefixText, { color: colors.textSecondary }]}>{COUNTRY_CODE}</Text>
              </View>
              <TextInput
                ref={ref}
                value={value}
                onChangeText={(text) => onChange(sanitizeIndianPhone(text))}
                onBlur={onBlur}
                onFocus={() => setFocused(true)}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                selectionColor={colors.primary}
                style={[styles.input, { color: colors.textPrimary, fontSize: 15 }]}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                maxLength={PHONE_LENGTH}
                returnKeyType={returnKeyType}
                accessibilityLabel={`${label} (${COUNTRY_CODE})`}
                underlineColorAndroid="transparent"
              />
            </View>
            {error ? (
              <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

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
  prefix: {
    marginRight: 10,
    paddingRight: 10,
    borderRightWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefixText: {
    fontSize: 15,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    includeFontPadding: false,
  },
  error: {
    fontSize: 11,
    marginLeft: 2,
    marginTop: 1,
    fontWeight: '500',
  },
});
