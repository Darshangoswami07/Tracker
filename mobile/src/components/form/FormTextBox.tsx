import { Ionicons } from '@expo/vector-icons';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { type TextInputProps } from 'react-native';
import { CustomInput } from '../CustomInput';

interface FormTextBoxProps<
  T extends FieldValues,
  K extends FieldPath<T> = FieldPath<T>,
>   extends Omit<TextInputProps, 'defaultValue'> {
  control: Control<T, any, T>;
  name: K;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  errorMessage?: string;
}

/** React Hook Form aware version of {@link CustomInput}. */
export function FormTextBox<T extends FieldValues>({
  control,
  name,
  label,
  icon,
  errorMessage,
  ...rest
}: FormTextBoxProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value, ref }, fieldState }) => (
        <CustomInput
          ref={ref}
          label={label}
          icon={icon}
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          error={fieldState.error?.message ?? errorMessage}
          {...rest}
        />
      )}
    />
  );
}