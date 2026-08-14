import { type ComponentProps, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface TimelineProps {
  events: Array<{
    id: string;
    status: string;
    description: string;
    timestamp: string;
    location?: string;
  }>;
}

export const Timeline = ({ events }: TimelineProps) => {
  const { colors, spacing, radii, fonts } = useAppTheme();
  const [animations] = useState(
    events.map(() => ({ fade: new Animated.Value(0), slide: new Animated.Value(20) }))
  );

  useEffect(() => {
    animations.forEach((anim, index) => {
      Animated.parallel([
        Animated.timing(anim.fade, { toValue: 1, duration: 400, delay: index * 100, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(anim.slide, { toValue: 0, duration: 400, delay: index * 100, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    });
  }, [animations]);

  const getStatusConfig = (status: string): { color: string; icon: IoniconName; label: string } => {
    switch (status.toLowerCase()) {
      case 'pending': return { color: '#F59E0B', icon: 'time-outline', label: 'Order Created' };
      case 'assigned': return { color: '#06B6D4', icon: 'person-add-outline', label: 'Driver Assigned' };
      case 'picked_up': return { color: '#8B5CF6', icon: 'cube-outline', label: 'Picked Up' };
      case 'in_transit': return { color: '#3B82F6', icon: 'navigate-outline', label: 'In Transit' };
      case 'delivered': return { color: '#10B981', icon: 'checkmark-circle-outline', label: 'Delivered' };
      case 'cancelled': return { color: '#EF4444', icon: 'close-circle-outline', label: 'Cancelled' };
      default: return { color: colors.textMuted, icon: 'information-circle-outline', label: status };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      {events.map((event, index) => {
        const config = getStatusConfig(event.status);
        const isLast = index === events.length - 1;
        const anim = animations[index];

        return (
          <Animated.View key={event.id} style={{ opacity: anim.fade, transform: [{ translateX: anim.slide }] }}>
            <View style={styles.row}>
              <View style={styles.lineContainer}>
                {!isLast && <View style={styles.line} />}
                <View style={[styles.dot, { backgroundColor: config.color, borderColor: config.color }]} />
              </View>
              <View style={styles.content}>
                <View style={styles.eventHeader}>
                  <View style={[styles.iconBadge, { backgroundColor: `${config.color}15`, borderRadius: radii.md }]}>
                    <Ionicons name={config.icon} size={18} color={config.color} />
                  </View>
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { color: colors.textPrimary, fontSize: fonts.size.sm }]}>{config.label}</Text>
                    <Text style={[styles.eventTime, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{formatTime(event.timestamp)}</Text>
                  </View>
                </View>
                <Text style={[styles.eventDescription, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>{event.description}</Text>
                {event.location && (
                  <View style={styles.locationRow}>
                    <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                    <Text style={[styles.eventLocation, { color: colors.textMuted, fontSize: fonts.size.xs }]}>{event.location}</Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineContainer: { position: 'relative', alignItems: 'center' },
  line: { position: 'absolute', top: 24, bottom: 0, width: 2, backgroundColor: '#E5E7EB' },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 3, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF', zIndex: 1 },
  content: { flex: 1, paddingTop: 2, gap: 6 },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBadge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  eventInfo: { flex: 1 },
  eventTitle: { fontWeight: '800' },
  eventTime: { fontWeight: '500', marginTop: 2 },
  eventDescription: { fontWeight: '500', lineHeight: 20 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  eventLocation: { fontWeight: '500' },
});

export default Timeline;