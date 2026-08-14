import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { CompanyOption } from '../../features/auth/types';
import { useAppTheme } from '../../theme/useAppTheme';

interface FormCompanySelectProps<
  T extends FieldValues,
  K extends FieldPath<T> = FieldPath<T>,
> {
  control: Control<T, any, T>;
  name: K;
  label: string;
  /** Company options to choose from. */
  options: CompanyOption[];
  loading?: boolean;
  errorMessage?: string;
}

/** React Hook Form aware company picker styled to match {@link CustomInput}. */
export function FormCompanySelect<T extends FieldValues>({
  control,
  name,
  label,
  options,
  loading,
  errorMessage,
}: FormCompanySelectProps<T>) {
  const { colors, radii, fonts } = useAppTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');

  const closeModal = () => {
    setQuery('');
    setModalOpen(false);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, value }, fieldState }) => {
        const error = fieldState.error?.message ?? errorMessage;
        const selected = options.find((option) => option.id === value);
        const borderColor = error ? colors.error : modalOpen ? colors.primary : colors.border;
        const borderWidth = modalOpen ? 1.5 : 1;
        const iconColor = error ? colors.error : colors.primary;

        return (
          <View style={styles.container}>
            {label ? (
              <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
            ) : null}
            <Pressable
              onPress={() => setModalOpen(true)}
              style={[
                styles.field,
                {
                  backgroundColor: colors.inputBackground,
                  borderRadius: radii.input,
                  borderColor: borderColor,
                  borderWidth,
                  shadowColor: colors.shadow,
                  shadowOpacity: 0.06,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 3 },
                  elevation: 1,
                },
              ]}
            >
              <View style={styles.iconWrap}>
                <Ionicons name="business-outline" size={18} color={iconColor} />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.value,
                  { color: selected ? colors.textPrimary : colors.textMuted, fontSize: fonts.size.md },
                ]}
              >
                {loading
                  ? 'Loading companies…'
                  : selected
                    ? selected.name
                    : 'Select a company'}
              </Text>
              <View style={styles.rightWrap}>
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
                )}
              </View>
            </Pressable>
            {error ? (
              <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
            ) : null}

            <Modal
              visible={modalOpen}
              transparent
              animationType="slide"
              onRequestClose={() => closeModal()}
            >
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.modalRoot}
              >
                <Pressable style={styles.backdrop} onPress={() => closeModal()} />
                <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
                  <View style={[styles.sheetHandle, { backgroundColor: colors.borderStrong }]} />
                  <Text style={[styles.sheetTitle, { color: colors.textPrimary, fontSize: fonts.size.lg }]}>
                    Select a company
                  </Text>

                  <View
                    style={[
                      styles.searchBox,
                      {
                        backgroundColor: colors.inputBackground,
                        borderRadius: radii.input,
                        borderColor: colors.border,
                        borderWidth: 1,
                      },
                    ]}
                  >
                    <Ionicons name="search-outline" size={16} color={colors.textMuted} />
                    <TextInput
                      value={query}
                      onChangeText={setQuery}
                      placeholder="Search companies"
                      placeholderTextColor={colors.textMuted}
                      selectionColor={colors.primary}
                      style={[styles.searchInput, { color: colors.textPrimary }]}
                      autoCapitalize="none"
                    />
                  </View>

                  <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.listContent}
                    style={styles.list}
                    ListEmptyComponent={
                      <Text style={[styles.empty, { color: colors.textMuted }]}>
                        {loading ? 'Loading companies…' : 'No companies found.'}
                      </Text>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[styles.option, { borderRadius: radii.md }]}
                        activeOpacity={0.7}
                        onPress={() => {
                          onChange(item.id);
                          closeModal();
                        }}
                      >
                        <Ionicons name="business-outline" size={18} color={colors.primary} />
                        <Text
                          numberOfLines={1}
                          style={[styles.optionText, { color: colors.textPrimary, fontSize: fonts.size.md }]}
                        >
                          {item.name}
                        </Text>
                        {item.id === value ? (
                          <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    )}
                  />

                  <TouchableOpacity
                    style={[styles.cancel, { borderColor: colors.borderStrong, borderRadius: radii.button }]}
                    activeOpacity={0.7}
                    onPress={() => closeModal()}
                  >
                    <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </Modal>
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
  iconWrap: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    flex: 1,
    fontWeight: '400',
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
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '70%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  sheetTitle: {
    fontWeight: '700',
    marginBottom: 14,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    includeFontPadding: false,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 4,
    paddingBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionText: {
    flex: 1,
    fontWeight: '400',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 24,
  },
  cancel: {
    marginTop: 10,
    height: 48,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
