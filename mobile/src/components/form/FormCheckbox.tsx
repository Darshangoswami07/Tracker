import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import type { ReactNode } from 'react';
import { Checkbox } from '../Checkbox';

interface FormCheckboxProps<T extends FieldValues = FieldValues> {
  control: Control<T, any, T>;
  name: FieldPath<T>;
  /** Label content; rich text (e.g. accents/links) supported via ReactNode. */
  children: ReactNode;
  errorMessage?: string;
}

/** React Hook Form aware checkbox. */
export function FormCheckbox<T extends FieldValues>({ control, name, children }: FormCheckboxProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value } }) => (
        <Checkbox checked={Boolean(value)} onPress={() => onChange(!value)}>
          {children}
        </Checkbox>
      )}
    />
  );
}