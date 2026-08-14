import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, type TextInput, type TextInputProps } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';
import { TextBox } from './TextBox';

interface PasswordFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  error?: string;
}

/** Password input with a show/hide toggle. */
export const PasswordField = forwardRef<TextInput, PasswordFieldProps>(
  ({ label, error, ...rest }, ref) => {
    const { colors } = useAppTheme();
    const [visible, setVisible] = useState(false);

    return (
      <TextBox
        ref={ref}
        label={label}
        icon="lock-closed"
        error={error}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        rightElement={
          <Pressable
            onPress={() => setVisible((prev) => !prev)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={visible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        }
        {...rest}
      />
    );
  },
);

PasswordField.displayName = 'PasswordField';