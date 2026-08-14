import { Ionicons } from '@expo/vector-icons';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useState } from 'react';
import { type TextInputProps, Pressable } from 'react-native';
import { CustomInput } from '../CustomInput';
import { useAppTheme } from '../../theme/useAppTheme';

interface FormPasswordFieldProps<
  T extends FieldValues,
  K extends FieldPath<T> = FieldPath<T>,
> extends Omit<TextInputProps, 'defaultValue' | 'secureTextEntry'> {
  control: Control<T, any, T>;
  name: K;
  label: string;
  errorMessage?: string;
}

/** Static show/hide eye used as the password field's trailing element. */
const PasswordToggle = ({ hidden }: { hidden: boolean }) => {
  const { colors } = useAppTheme();
  return (
    <Ionicons
      name={hidden ? 'eye-off-outline' : 'eye-outline'}
      size={18}
      color={colors.textSecondary}
    />
  );
};

/** React Hook Form aware password input with a toggleable show/hide eye. */
export function FormPasswordField<T extends FieldValues>({
  control,
  name,
  label,
  errorMessage,
  ...rest
}: FormPasswordFieldProps<T>) {
  const [hidden, setHidden] = useState(true);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value, ref }, fieldState }) => (
        <CustomInput
          ref={ref}
          label={label}
          icon="lock-closed-outline"
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          secureTextEntry={hidden}
          error={fieldState.error?.message ?? errorMessage}
          rightElement={
            <Pressable
              onPress={() => setHidden((h) => !h)}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <PasswordToggle hidden={hidden} />
            </Pressable>
          }
          {...rest}
        />
      )}
    />
  );
}