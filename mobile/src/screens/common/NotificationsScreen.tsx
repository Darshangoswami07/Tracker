import { useEffect, useState, useCallback } from 'react';
import type { ComponentProps } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { FilterChips } from '../../components/FilterChips';
import { useAppNav } from '../../hooks/useAppNav';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, any>;
}

export const NotificationsScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const { goBack } = useAppNav();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    notificationsList: { gap: spacing.md },
    notifCard: { padding: 16, marginHorizontal: 4 },
    notifContent: { flexDirection: 'row', gap: 12 },
    notifIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    notifText: { flex: 1, gap: 4 },
    notifHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    notifTitle: { fontSize: fonts.size.md },
    unreadDot: { width: 8, height: 8, borderRadius: 4 },
    notifMessage: { fontSize: fonts.size.sm, fontWeight: '500', lineHeight: 20 },
    notifTime: { fontSize: fonts.size.xs, fontWeight: '500', marginTop: 2 },
    notifCardShimmer: { marginBottom: spacing.md, borderRadius: radii.lg },
  });

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchNotifications = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.notifications}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: 1, pageSize: 50, read: filter === 'unread' ? false : filter === 'read' ? true : undefined },
      });
      setNotifications(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, filter]);

  const markAsRead = async (id: string) => {
    try {
      await api.post(`${ENDPOINTS.notifications}/${id}/read`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.post(`${ENDPOINTS.notifications}/read-all`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    fetchNotifications();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchNotifications, fadeAnim, slideAnim]);

  useEffect(() => {
    fetchNotifications();
  }, [filter]);

  const filters = ['all', 'unread', 'read'];
  const unreadCount = notifications.filter(n => !n.read).length;

  const getNotificationConfig = (type: string): { icon: ComponentProps<typeof Ionicons>['name']; color: string; bg: string } => {
    switch (type) {
      case 'order_created': return { icon: 'document-text-outline', color: '#635BFF', bg: '#635BFF15' };
      case 'order_cleared': return { icon: 'checkmark-done-outline', color: '#10B981', bg: '#10B98115' };
      case 'order_uncleared': return { icon: 'alert-circle-outline', color: '#F97316', bg: '#F9731615' };
      case 'order_delivered': return { icon: 'checkmark-circle-outline', color: '#10B981', bg: '#10B98115' };
      case 'driver_assigned': return { icon: 'person-outline', color: '#F97316', bg: '#F9731615' };
      case 'payment_received': return { icon: 'cash-outline', color: '#10B981', bg: '#10B98115' };
      case 'system_alert': return { icon: 'alert-circle-outline', color: '#F59E0B', bg: '#F59E0B15' };
      default: return { icon: 'notifications-outline', color: colors.textMuted, bg: `${colors.textMuted}15` };
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Notifications" leftAction={{ icon: 'chevron-back', onPress: goBack, accessibilityLabel: 'Go back' }} rightAction={{ icon: 'checkmark-circle', onPress: markAllAsRead }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.notifCardShimmer} height={100} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        }}
      >
        <View style={styles.header}>
          <Header 
            title={`Notifications${unreadCount > 0 ? ` (${unreadCount})` : ''}`} 
            leftAction={{ icon: 'chevron-back', onPress: goBack, accessibilityLabel: 'Go back' }} 
            rightAction={{ icon: unreadCount > 0 ? 'checkmark-circle' : 'checkmark-circle', onPress: () => { if (unreadCount > 0) void markAllAsRead(); } }}
          />
        </View>
      </Animated.View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#635BFF']}
            progressBackgroundColor={colors.surface}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <FilterChips filters={filters} activeFilter={filter} onFilterChange={setFilter} />
        </Animated.View>

        {notifications.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="No notifications"
            subtitle={filter !== 'all' ? `No ${filter} notifications` : 'You\'re all caught up!'}
            iconColor={colors.textMuted}
          />
        ) : (
          <View style={styles.notificationsList}>
            {notifications.map((notification, index) => {
              const config = getNotificationConfig(notification.type);
              return (
                <Animated.View
                  key={notification.id}
                  style={[
                    styles.notifCard,
                    { 
                      backgroundColor: colors.surface, 
                      borderRadius: radii.lg, 
                      ...shadows.sm,
                      opacity: notification.read ? 0.7 : 1,
                    },
                    { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.notifContent}
                    onPress={() => !notification.read && markAsRead(notification.id)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.notifIcon, { backgroundColor: config.bg, borderRadius: radii.md }]}>
                      <Ionicons name={config.icon} size={22} color={config.color} />
                    </View>
                    <View style={styles.notifText} >
                      <View style={styles.notifHeader}>
                        <Text style={[styles.notifTitle, { color: colors.textPrimary, fontWeight: notification.read ? '600' : '800' }]}>{notification.title}</Text>
                        {!notification.read && (
                          <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />
                        )}
                      </View>
                      <Text style={[styles.notifMessage, { color: colors.textSecondary }]}>{notification.message}</Text>
                      <Text style={[styles.notifTime, { color: colors.textMuted }]}>{formatTime(notification.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                </Animated.View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default NotificationsScreen;