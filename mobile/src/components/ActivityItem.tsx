import { type ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface ActivityItemProps {
  activity: {
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
    metadata?: Record<string, any>;
  };
}

export const ActivityItem = ({ activity }: ActivityItemProps) => {
  const { colors, spacing, radii, fonts } = useAppTheme();

  const getActivityConfig = (type: string): { icon: IoniconName; color: string; bg: string } => {
    switch (type) {
      case 'order_created': return { icon: 'document-text-outline', color: '#635BFF', bg: '#635BFF15' };
      case 'order_assigned': return { icon: 'person-add-outline', color: '#06B6D4', bg: '#06B6D415' };
      case 'order_picked_up': return { icon: 'cube-outline', color: '#8B5CF6', bg: '#8B5CF615' };
      case 'order_delivered': return { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#10B98115' };
      case 'driver_assigned': return { icon: 'person-outline', color: '#F97316', bg: '#F9731615' };
      case 'vehicle_assigned': return { icon: 'car-outline', color: '#8B5CF6', bg: '#8B5CF615' };
      case 'payment_received': return { icon: 'cash-outline', color: '#10B981', bg: '#10B98115' };
      default: return { icon: 'information-circle-outline', color: colors.textMuted, bg: `${colors.textMuted}15` };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const config = getActivityConfig(activity.type);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderRadius: radii.md }]}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: config.bg, borderRadius: radii.sm }]}>
          <Ionicons name={config.icon} size={20} color={config.color} />
        </View>
        <View style={styles.textContent} >
          <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{activity.title}</Text>
          <Text style={[styles.description, { color: colors.textSecondary, fontSize: fonts.size.xs }]}>{activity.description}</Text>
        </View>
        <Text style={[styles.time, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{formatTime(activity.timestamp)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 12, marginHorizontal: 4 },
  content: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  iconContainer: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  textContent: { flex: 1, gap: 2 },
  title: { fontWeight: '700' },
  description: { fontWeight: '500' },
  time: { fontWeight: '500', marginTop: 2 },
});

export default ActivityItem;