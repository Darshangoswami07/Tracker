import { StyleSheet, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface FilterChipsProps {
  filters: string[];
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export const FilterChips = ({ filters, activeFilter, onFilterChange }: FilterChipsProps) => {
  const { colors, spacing, radii, fonts } = useAppTheme();

  const formatFilter = (filter: string) => {
    if (filter === 'all') return 'All';
    return filter.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter}
          style={[
            styles.chip,
            { borderRadius: radii.pill },
            filter === activeFilter ? styles.chipActive : styles.chipInactive,
          ]}
          onPress={() => onFilterChange(filter)}
          activeOpacity={0.8}
        >
          <Text style={[
            styles.chipText,
            { fontSize: fonts.size.sm },
            filter === activeFilter ? styles.chipTextActive : styles.chipTextInactive,
          ]}>
            {formatFilter(filter)}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: 4, gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  chipActive: { backgroundColor: '#635BFF', borderColor: '#635BFF' },
  chipInactive: { backgroundColor: 'transparent', borderColor: '#E5E7EB' },
  chipText: { fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  chipTextInactive: { color: '#6B7280' },
});

export default FilterChips;