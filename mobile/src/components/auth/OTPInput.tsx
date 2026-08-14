import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  error?: boolean;
  onFilled?: (value: string) => void;
  accessibilityLabel?: string;
}

/** Premium 6-box OTP entry field backed by a hidden numeric input. */
export const OTPInput = ({
  value,
  onChange,
  length = 6,
  autoFocus = false,
  disabled = false,
  error = false,
  onFilled,
  accessibilityLabel,
}: OTPInputProps) => {
  const { colors, radii } = useAppTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const digits = value.split('');
  const activeIndex = Math.min(digits.length, length - 1);

  const handleChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length && onFilled) onFilled(clean);
  };

  return (
    <Pressable
      onPress={() => {
        if (!disabled) inputRef.current?.focus();
      }}
      style={styles.wrap}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? 'One-time passcode'}
    >
      {Array.from({ length }).map((_, index) => {
        const isFilled = index < digits.length;
        const isActive = focused && !isFilled && index === activeIndex;
        const borderColor = error
          ? colors.error
          : isActive
            ? colors.primary
            : isFilled
            ? colors.primary
            : colors.borderStrong;

        return (
          <View
            key={index}
            style={[
              styles.box,
              {
                borderRadius: radii.input,
                borderColor,
                backgroundColor: isActive ? colors.primarySoft : colors.surface,
                borderWidth: isActive ? 2 : 1.5,
              },
            ]}
          >
            {isFilled ? (
              <Text style={[styles.digit, { color: colors.textPrimary }]}>{digits[index]}</Text>
            ) : isActive ? (
              <View style={[styles.caret, { backgroundColor: colors.primary }]} />
            ) : null}
          </View>
        );
      })}

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        maxLength={length}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        autoFocus={autoFocus}
        editable={!disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.srOnly}
        aria-hidden={false}
        accessibilityLabel={accessibilityLabel ?? 'Enter OTP digits'}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    width: '100%',
    maxWidth: 340,
    alignSelf: 'center',
  },
  box: {
    flex: 1,
    aspectRatio: 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    fontSize: 24,
    fontWeight: '700',
  },
  caret: {
    width: 2,
    height: 30,
    borderRadius: 1,
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
});