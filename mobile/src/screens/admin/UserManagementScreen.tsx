import { useEffect, useState, useCallback } from 'react';
import { Animated, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import { ActionButton } from '../../components/ActionButton';
import type { AppTheme } from '../../theme/types';
import { useAppNav } from '../../hooks/useAppNav';

interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  isActive: boolean;
  isVerified: boolean;
  isApproved: boolean;
  createdAt: string;
}

export const UserManagementScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(20));

  const fetchUsers = useCallback(async (pageNum = 1, isRefresh = false) => {
    if (!accessToken) return;
    try {
      const res = await api.get(ENDPOINTS.admin.users, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { 
          page: pageNum, 
          pageSize: 20, 
          search: search || undefined,
          role: roleFilter === 'all' ? undefined : roleFilter,
          status: statusFilter === 'all' ? undefined : statusFilter,
        },
      });
      const newUsers = res.data.data.items || [];
      if (isRefresh || pageNum === 1) {
        setUsers(newUsers);
      } else {
        setUsers(prev => [...prev, ...newUsers]);
      }
      setHasMore(newUsers.length === 20);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, search, roleFilter, statusFilter]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUsers(1, true);
  }, [fetchUsers]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchUsers(page + 1);
    }
  }, [loading, hasMore, page, fetchUsers]);

  useEffect(() => {
    fetchUsers();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fetchUsers, fadeAnim, slideAnim]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers(1, true);
    }, 500);
    return () => clearTimeout(timer);
  }, [search, roleFilter, statusFilter]);

  const roles = ['all', 'admin', 'business', 'driver', 'employee', 'dispatcher'];
  const statuses = ['all', 'pending', 'approved', 'rejected', 'active', 'suspended'];

  const handleAction = async (userId: string, action: 'activate' | 'suspend' | 'reject') => {
    // Real endpoint is `PATCH /admin/users/{id}/status` with a
    // `{status, reason}` body — the previous `POST .../{userId}/{action}`
    // call hit a route that never existed (always 404'd).
    const status = action === 'activate' ? 'active' : 'suspended'; // reject == suspend, per product decision
    try {
      await api.patch(ENDPOINTS.admin.userStatus(userId), { status }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      fetchUsers(1, true);
    } catch (error) {
      console.error('Failed to perform action:', error);
      Alert.alert('Action Failed', `Could not ${action} this user. Please try again.`);
    }
  };

  const openUser = (user: User) => {
    Alert.alert(user.fullName, `Role: ${user.role}\nEmail: ${user.email}\nPhone: ${user.phone}\nStatus: ${user.status}\n\n${user.isActive ? 'Account is active.' : 'Account is inactive.'}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="User Management" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.searchBar}>
            <ShimmerCard style={styles.searchShimmer} height={48} />
          </View>
          <View style={styles.filters}>
            <ShimmerCard style={styles.filterShimmer} height={36} />
            <ShimmerCard style={styles.filterShimmer} height={36} />
          </View>
          {[1,2,3,4,5].map((i) => <ShimmerCard key={i} style={styles.userCardShimmer} height={100} />)}
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
          <Header title="User Management" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200 && !loading && hasMore) {
            loadMore();
          }
        }}
        scrollEventThrottle={200}
      >
        <Animated.View
          style={{
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }}
        >
          <View style={styles.searchBar}>
            <View style={styles.searchInput}>
              <Ionicons name="search" size={20} color={colors.textMuted} />
              <TextInput
                placeholder="Search users..."
                value={search}
                onChangeText={setSearch}
                style={styles.searchTextInput}
              />
            </View>
          </View>

          <View style={styles.filters}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
              {roles.map((role) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.filterChip,
                    { borderRadius: radii.pill },
                    roleFilter === role ? styles.filterChipActive : styles.filterChipInactive,
                  ]}
                  onPress={() => setRoleFilter(role)}
                >
                  <Text style={[
                    styles.filterChipText,
                    roleFilter === role ? styles.filterChipTextActive : styles.filterChipTextInactive,
                  ]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContainer}>
              {statuses.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.filterChip,
                    { borderRadius: radii.pill },
                    statusFilter === status ? styles.filterChipActive : styles.filterChipInactive,
                  ]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text style={[
                    styles.filterChipText,
                    statusFilter === status ? styles.filterChipTextActive : styles.filterChipTextInactive,
                  ]}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Animated.View>

        {users.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No users found"
            subtitle={search || roleFilter !== 'all' || statusFilter !== 'all' ? 'Try adjusting your filters' : 'No users in the system'}
            actionLabel={search || roleFilter !== 'all' || statusFilter !== 'all' ? 'Clear Filters' : undefined}
            onActionPress={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); }}
          />
        ) : (
          <Animated.View
            style={{
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            }}
          >
            <View style={styles.usersList}>
              {users.map((user) => (
                <TouchableOpacity key={user.id} style={styles.userCard} onPress={() => openUser(user)} activeOpacity={0.85}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>{user.fullName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <View style={styles.userHeader}>
                      <Text style={[styles.userName, { color: colors.textPrimary }]}>{user.fullName}</Text>
                      <StatusBadge status={user.role} size="sm" />
                    </View>
                    <View style={styles.userMeta}>
                      <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>
                      <Text style={[styles.userPhone, { color: colors.textMuted }]}>{user.phone}</Text>
                    </View>
                    <View style={styles.userBadges}>
                      <StatusBadge status={user.status} size="sm" />
                      <View style={[styles.statusDot, { backgroundColor: user.isActive ? '#10B981' : '#EF4444' }]} />
                    </View>
                  </View>
                  <View style={styles.userActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(user.id, 'activate')}>
                      <Ionicons name="checkmark" size={18} color="#10B981" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(user.id, 'suspend')}>
                      <Ionicons name="pause" size={18} color="#F59E0B" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction(user.id, 'reject')}>
                      <Ionicons name="close" size={18} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {hasMore && <View style={styles.loadMore}><Text style={styles.loadMoreText}>Load more...</Text></View>}
          </Animated.View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: theme.spacing.lg },
    searchBar: { marginBottom: theme.spacing.md },
    searchInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, paddingHorizontal: 16, paddingVertical: 12, ...theme.shadows.sm },
    searchTextInput: { flex: 1, fontSize: theme.fonts.size.md, color: theme.colors.textPrimary },
    searchShimmer: { borderRadius: theme.radii.lg },
    filters: { gap: theme.spacing.md, marginBottom: theme.spacing.lg },
    filtersContainer: { gap: theme.spacing.sm, paddingHorizontal: 4 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
    filterChipActive: { backgroundColor: '#635BFF', borderColor: '#635BFF' },
    filterChipInactive: { backgroundColor: 'transparent', borderColor: '#E5E7EB' },
    filterChipText: { fontWeight: '700', fontSize: theme.fonts.size.sm },
    filterChipTextActive: { color: '#FFFFFF' },
    filterChipTextInactive: { color: '#6B7280' },
    filterShimmer: { width: 120, borderRadius: theme.radii.pill },
    usersList: { gap: theme.spacing.md },
    userCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: 14, ...theme.shadows.sm },
    userCardShimmer: { marginBottom: theme.spacing.md, borderRadius: theme.radii.lg },
    userAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#635BFF15', alignItems: 'center', justifyContent: 'center' },
    userAvatarText: { fontSize: 16, fontWeight: '800', color: '#635BFF' },
    userInfo: { flex: 1, gap: 6 },
    userHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    userName: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    userMeta: { gap: 2 },
    userEmail: { fontSize: theme.fonts.size.sm, fontWeight: '500' },
    userPhone: { fontSize: theme.fonts.size.xs, fontWeight: '500' },
    userBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    userActions: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: theme.radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
    loadMore: { paddingVertical: theme.spacing.lg, alignItems: 'center' },
    loadMoreText: { color: '#635BFF', fontWeight: '600' },
  });

export default UserManagementScreen;
