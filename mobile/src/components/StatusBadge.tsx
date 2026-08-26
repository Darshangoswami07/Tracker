import { type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export const StatusBadge = ({ status, size = 'md', showIcon = true }: StatusBadgeProps) => {
  const { colors, spacing, radii, fonts } = useAppTheme();

  const getConfig = (status: string): { color: string; icon: IoniconName; label: string } => {
    switch (status.toLowerCase()) {
      case 'pending': return { color: '#F59E0B', icon: 'time-outline', label: 'Pending' };
      case 'approved_pending_otp': return { color: '#3B82F6', icon: 'mail-outline', label: 'Approved · OTP Sent' };
      case 'rejected': return { color: '#EF4444', icon: 'close-circle-outline', label: 'Rejected' };
      case 'cleared': return { color: '#10B981', icon: 'checkmark-done-outline', label: 'Cleared' };
      case 'uncleared': return { color: '#F97316', icon: 'alert-circle-outline', label: 'Uncleared' };
      case 'delivered': return { color: '#10B981', icon: 'checkmark-circle-outline', label: 'Delivered' };
      case 'active': return { color: '#10B981', icon: 'checkmark-circle-outline', label: 'Active' };
      case 'inactive': return { color: '#EF4444', icon: 'close-circle-outline', label: 'Inactive' };
      case 'maintenance': return { color: '#F97316', icon: 'construct-outline', label: 'Maintenance' };
      case 'offline': return { color: '#6B7280', icon: 'wifi-outline', label: 'Offline' };
      case 'online': return { color: '#10B981', icon: 'wifi-outline', label: 'Online' };
      case 'available': return { color: '#10B981', icon: 'checkmark-circle-outline', label: 'Available' };
      case 'busy': return { color: '#F59E0B', icon: 'time-outline', label: 'Busy' };
      default: return { color: colors.textMuted, icon: 'help-outline', label: status.replace('_', ' ') };
    }
  };

  const config = getConfig(status);
  const sizes = {
    sm: { paddingHorizontal: 8, paddingVertical: 3, fontSize: fonts.size.xs, iconSize: 10, gap: 3 },
    md: { paddingHorizontal: 10, paddingVertical: 4, fontSize: fonts.size.xs, iconSize: 12, gap: 4 },
    lg: { paddingHorizontal: 14, paddingVertical: 6, fontSize: fonts.size.sm, iconSize: 14, gap: 6 },
  };

  const s = sizes[size];

  return (
    <View style={[styles.badge, { backgroundColor: `${config.color}15`, borderRadius: radii.pill }]}>
      {showIcon && <Ionicons name={config.icon} size={s.iconSize} color={config.color} style={{ marginRight: s.gap }} />}
      <Text style={[styles.text, { color: config.color, fontSize: s.fontSize, paddingHorizontal: s.paddingHorizontal, paddingVertical: s.paddingVertical }]}>
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center' },
  text: { fontWeight: '800' },
});

export default StatusBadge;