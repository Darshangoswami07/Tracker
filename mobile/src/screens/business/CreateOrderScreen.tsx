import { useEffect, useState } from 'react';
import { Animated, Keyboard, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TouchableOpacity, View, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAppNav } from '../../hooks/useAppNav';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { ActionButton } from '../../components/ActionButton';
import { FilterChips } from '../../components/FilterChips';
import { StatusBadge } from '../../components/StatusBadge';
import type { AppTheme } from '../../theme/types';

interface Customer {
  id: string;
  fullName: string;
  phone: string;
  email: string;
}

interface Driver {
  id: string;
  fullName: string;
  phone: string;
  vehiclePlate?: string;
  rating: number;
}

interface Vehicle {
  id: string;
  licensePlate: string;
  vehicleType: string;
  driverName?: string;
}

export const CreateOrderScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = createStyles({ colors, spacing, radii, fonts, shadows });

  const [formData, setFormData] = useState({
    customerId: '',
    driverId: '',
    vehicleId: '',
    orderType: 'delivery',
    priority: 'normal',
    pickupAddress: '',
    pickupLat: 0,
    pickupLng: 0,
    deliveryAddress: '',
    deliveryLat: 0,
    deliveryLng: 0,
    weight: '',
    dimensions: '',
    value: '',
    notes: '',
    scheduledTime: '',
    codAmount: '',
  });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    fetchCustomers();
    fetchDrivers();
    fetchVehicles();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    setLoading(false);
  }, [fadeAnim, slideAnim]);

  const fetchCustomers = async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.business}/customers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: 1, pageSize: 100 },
      });
      setCustomers(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    }
  };

  const fetchDrivers = async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.business}/drivers`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: 1, pageSize: 100, status: 'available' },
      });
      setDrivers(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch drivers:', error);
    }
  };

  const fetchVehicles = async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.business}/vehicles`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: { page: 1, pageSize: 100, status: 'available' },
      });
      setVehicles(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch vehicles:', error);
    }
  };

  const handleSubmit = async () => {
    const required = ['customerId', 'pickupAddress', 'deliveryAddress'];
    const missing = required.filter(field => !formData[field as keyof typeof formData]);
    if (missing.length > 0) {
      Alert.alert('Missing Information', 'Please fill in all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`${ENDPOINTS.business}/orders`, formData, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      Alert.alert('Success', 'Order created successfully!');
      setFormData({
        customerId: '', driverId: '', vehicleId: '', orderType: 'delivery', priority: 'normal',
        pickupAddress: '', pickupLat: 0, pickupLng: 0, deliveryAddress: '', deliveryLat: 0, deliveryLng: 0,
        weight: '', dimensions: '', value: '', notes: '', scheduledTime: '', codAmount: '',
      });
    } catch (error) {
      console.error('Failed to create order:', error);
      Alert.alert('Error', 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="New Order" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title="New Order" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Create New Order</Text>
            <Text style={styles.formSubtitle}>Fill in the details to create a delivery order</Text>
          </View>
        </Animated.View>
      </Animated.View>

      <KeyboardAvoidingView behavior="padding" style={styles.keyboardAvoiding} keyboardVerticalOffset={80}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View
            style={{
              transform: [{ translateY: slideAnim }],
              opacity: fadeAnim,
            }}
          >
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Order Type & Priority</Text>
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <FormField label="Order Type" icon="swap-horizontal-outline">
                  <View style={styles.optionRow}>
                    <OrderTypeOption value="delivery" label="Delivery" selected={formData.orderType === 'delivery'} onPress={() => setFormData({...formData, orderType: 'delivery'})} />
                    <OrderTypeOption value="pickup" label="Pickup" selected={formData.orderType === 'pickup'} onPress={() => setFormData({...formData, orderType: 'pickup'})} />
                    <OrderTypeOption value="return" label="Return" selected={formData.orderType === 'return'} onPress={() => setFormData({...formData, orderType: 'return'})} />
                  </View>
                </FormField>

                <FormField label="Priority" icon="flash-outline">
                  <View style={styles.optionRow}>
                    <PriorityOption value="normal" label="Normal" selected={formData.priority === 'normal'} onPress={() => setFormData({...formData, priority: 'normal'})} />
                    <PriorityOption value="express" label="Express" selected={formData.priority === 'express'} onPress={() => setFormData({...formData, priority: 'express'})} />
                    <PriorityOption value="urgent" label="Urgent" selected={formData.priority === 'urgent'} onPress={() => setFormData({...formData, priority: 'urgent'})} />
                  </View>
                </FormField>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Customer</Text>
              <TouchableOpacity style={styles.selectCard} onPress={() => setShowCustomerModal(true)}>
                <View style={[styles.selectIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                  <Ionicons name="person-outline" size={22} color="#635BFF" />
                </View>
                <View style={styles.selectContent}>
                  <Text style={[styles.selectLabel, { color: colors.textMuted }]}>Select Customer</Text>
                  <Text style={[styles.selectValue, { color: formData.customerId ? colors.textPrimary : colors.textMuted }]}>
                    {formData.customerId ? customers.find(c => c.id === formData.customerId)?.fullName || 'Selected' : 'Tap to select customer'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pickup Location</Text>
              <View style={[styles.addressCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter pickup address"
                  value={formData.pickupAddress}
                  onChangeText={(v) => setFormData({...formData, pickupAddress: v})}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Delivery Location</Text>
              <View style={[styles.addressCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter delivery address"
                  value={formData.deliveryAddress}
                  onChangeText={(v) => setFormData({...formData, deliveryAddress: v})}
                  multiline
                  numberOfLines={2}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Package Details</Text>
              <View style={[styles.detailCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <FormField label="Weight (kg)" icon="scale-outline">
                  <TextInput style={styles.textInput} placeholder="Enter weight" value={formData.weight} onChangeText={(v) => setFormData({...formData, weight: v})} keyboardType="decimal-pad" />
                </FormField>
                <FormField label="Dimensions (LxWxH cm)" icon="resize-outline">
                  <TextInput style={styles.textInput} placeholder="e.g., 30x20x15" value={formData.dimensions} onChangeText={(v) => setFormData({...formData, dimensions: v})} />
                </FormField>
                <FormField label="Declared Value (₹)" icon="cash-outline">
                  <TextInput style={styles.textInput} placeholder="Enter value" value={formData.value} onChangeText={(v) => setFormData({...formData, value: v})} keyboardType="numeric" />
                </FormField>
                <FormField label="COD Amount (₹)" icon="card-outline">
                  <TextInput style={styles.textInput} placeholder="Enter COD amount (0 if none)" value={formData.codAmount} onChangeText={(v) => setFormData({...formData, codAmount: v})} keyboardType="numeric" />
                </FormField>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assign Driver (Optional)</Text>
              <TouchableOpacity style={styles.selectCard} onPress={() => setShowDriverModal(true)}>
                <View style={[styles.selectIcon, { backgroundColor: '#06B6D415', borderRadius: radii.md }]}>
                  <Ionicons name="person-add-outline" size={22} color="#06B6D4" />
                </View>
                <View style={styles.selectContent}>
                  <Text style={[styles.selectLabel, { color: colors.textMuted }]}>Assign Driver</Text>
                  <Text style={[styles.selectValue, { color: formData.driverId ? colors.textPrimary : colors.textMuted }]}>
                    {formData.driverId ? drivers.find(d => d.id === formData.driverId)?.fullName || 'Selected' : 'Tap to assign driver'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Assign Vehicle (Optional)</Text>
              <TouchableOpacity style={styles.selectCard} onPress={() => setShowVehicleModal(true)}>
                <View style={[styles.selectIcon, { backgroundColor: '#F9731615', borderRadius: radii.md }]}>
                  <Ionicons name="car-sport-outline" size={22} color="#F97316" />
                </View>
                <View style={styles.selectContent}>
                  <Text style={[styles.selectLabel, { color: colors.textMuted }]}>Assign Vehicle</Text>
                  <Text style={[styles.selectValue, { color: formData.vehicleId ? colors.textPrimary : colors.textMuted }]}>
                    {formData.vehicleId ? vehicles.find(v => v.id === formData.vehicleId)?.licensePlate || 'Selected' : 'Tap to assign vehicle'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Additional Notes</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}
                placeholder="Special instructions for driver..."
                value={formData.notes}
                onChangeText={(v) => setFormData({...formData, notes: v})}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Schedule Pickup</Text>
              <TouchableOpacity style={[styles.scheduleCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
                <View style={[styles.scheduleIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
                  <Ionicons name="calendar-outline" size={24} color="#635BFF" />
                </View>
                <View style={styles.scheduleContent}>
                  <Text style={[styles.scheduleLabel, { color: colors.textMuted }]}>Preferred Pickup Time</Text>
                  <Text style={[styles.scheduleValue, { color: formData.scheduledTime ? colors.textPrimary : colors.textMuted }]}>
                    {formData.scheduledTime || 'As soon as possible'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ActionButton
              label={submitting ? 'Creating...' : 'Create Order'}
              icon={submitting ? 'refresh' : 'paper-plane'}
              variant="primary"
              size="lg"
              fullWidth
              onPress={handleSubmit}
              disabled={submitting}
              loading={submitting}
            />
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showCustomerModal && (
        <SelectionModal
          title="Select Customer"
          items={customers.map(c => ({ id: c.id, label: c.fullName, sublabel: c.phone }))}
          selectedId={formData.customerId}
          onSelect={(id) => { setFormData({...formData, customerId: id }); setShowCustomerModal(false); }}
          onClose={() => setShowCustomerModal(false)}
        />
      )}
      {showDriverModal && (
        <SelectionModal
          title="Assign Driver"
          items={drivers.map(d => ({ id: d.id, label: d.fullName, sublabel: `${d.vehiclePlate || 'No vehicle'} • ⭐ ${d.rating}` }))}
          selectedId={formData.driverId}
          onSelect={(id) => { setFormData({...formData, driverId: id }); setShowDriverModal(false); }}
          onClose={() => setShowDriverModal(false)}
        />
      )}
      {showVehicleModal && (
        <SelectionModal
          title="Assign Vehicle"
          items={vehicles.map(v => ({ id: v.id, label: v.licensePlate, sublabel: `${v.vehicleType} • ${v.driverName ? `Driver: ${v.driverName}` : 'Unassigned'}` }))}
          selectedId={formData.vehicleId}
          onSelect={(id) => { setFormData({...formData, vehicleId: id }); setShowVehicleModal(false); }}
          onClose={() => setShowVehicleModal(false)}
        />
      )}
    </SafeAreaView>
  );
};

const FormField = ({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <View style={styles.formField}>
      <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>{label}</Text>
      {children}
    </View>
  );
};

const OrderTypeOption = ({ value, label, selected, onPress }: { value: string; label: string; selected: boolean; onPress: () => void }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <TouchableOpacity style={[styles.optionChip, { borderColor: selected ? '#635BFF' : '#E5E7EB', backgroundColor: selected ? '#635BFF15' : 'transparent' }]} onPress={onPress}>
      <Text style={[styles.optionText, { color: selected ? '#635BFF' : colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const PriorityOption = ({ value, label, selected, onPress }: { value: string; label: string; selected: boolean; onPress: () => void }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  const priorityColors: Record<string, string> = { normal: '#635BFF', express: '#F97316', urgent: '#EF4444' };
  return (
    <TouchableOpacity style={[styles.optionChip, { borderColor: selected ? priorityColors[value] : '#E5E7EB', backgroundColor: selected ? `${priorityColors[value]}15` : 'transparent' }]} onPress={onPress}>
      <Text style={[styles.optionText, { color: selected ? priorityColors[value] : colors.textPrimary }]}>{label}</Text>
    </TouchableOpacity>
  );
};

const SelectionModal = ({ title, items, selectedId, onSelect, onClose }: { title: string; items: Array<{id: string; label: string; sublabel: string}>; selectedId: string; onSelect: (id: string) => void; onClose: () => void }) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const styles = createStyles({ colors, spacing, radii, fonts, shadows });
  return (
    <View style={styles.modalOverlay} onStartShouldSetResponder={() => true}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, ...shadows.lg }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.modalClose}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
          {items.map(item => (
            <TouchableOpacity key={item.id} style={[styles.modalItem, selectedId === item.id && { backgroundColor: '#635BFF15', borderLeftWidth: 3, borderLeftColor: '#635BFF' }]} onPress={() => onSelect(item.id)}>
              <View style={styles.modalItemContent}>
                <Text style={[styles.modalItemLabel, { color: colors.textPrimary }]}>{item.label}</Text>
                <Text style={[styles.modalItemSublabel, { color: colors.textMuted }]}>{item.sublabel}</Text>
              </View>
              {selectedId === item.id && <Ionicons name="checkmark-circle" size={24} color="#635BFF" />}
            </TouchableOpacity>
          ))}
          {items.length === 0 && (
            <View style={styles.modalEmpty}>
              <Text style={{ color: colors.textMuted }}>No items available</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};

const createStyles = (theme: Pick<AppTheme, 'colors' | 'spacing' | 'radii' | 'fonts' | 'shadows'>) =>
  StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: theme.spacing.lg, paddingBottom: 8 },
    formHeader: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg, gap: 4 },
    formTitle: { fontSize: theme.fonts.size.xl, fontWeight: '800', color: theme.colors.textPrimary },
    formSubtitle: { fontSize: theme.fonts.size.sm, fontWeight: '500', color: theme.colors.textSecondary },
    keyboardAvoiding: { flex: 1 },
    scrollContent: { paddingBottom: 100, paddingHorizontal: theme.spacing.lg },
    section: { marginBottom: theme.spacing.xl },
    sectionTitle: { fontSize: theme.fonts.size.md, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    detailCard: { padding: 20, gap: theme.spacing.lg },
    formField: { gap: theme.spacing.sm },
    fieldLabel: { fontSize: theme.fonts.size.sm, fontWeight: '700', marginBottom: theme.spacing.sm, color: theme.colors.textSecondary },
    optionRow: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
    optionChip: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 2, borderRadius: theme.radii.md },
    optionText: { fontSize: theme.fonts.size.md, fontWeight: '700' },
    selectCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.colors.surface, borderRadius: theme.radii.xl, padding: 16, ...theme.shadows.sm },
    selectIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    selectContent: { flex: 1, gap: 4 },
    selectLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    selectValue: { fontSize: theme.fonts.size.md, fontWeight: '500' },
    addressCard: { padding: 16 },
    textInput: { backgroundColor: theme.colors.background, borderRadius: theme.radii.lg, padding: 16, fontSize: theme.fonts.size.md, color: theme.colors.textPrimary, borderWidth: 1, borderColor: '#E5E7EB', minHeight: 60, textAlignVertical: 'top' },
    textArea: { padding: 16, fontSize: theme.fonts.size.md, color: theme.colors.textPrimary, minHeight: 100 },
    scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    scheduleIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    scheduleContent: { flex: 1, gap: 2 },
    scheduleLabel: { fontSize: theme.fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    scheduleValue: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContainer: { maxHeight: '80%', paddingBottom: theme.spacing.lg },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    modalTitle: { fontSize: theme.fonts.size.lg, fontWeight: '800', color: theme.colors.textPrimary },
    modalClose: { padding: 8 },
    modalList: { maxHeight: 400 },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    modalItemContent: { flex: 1 },
    modalItemLabel: { fontSize: theme.fonts.size.md, fontWeight: '600' },
    modalItemSublabel: { fontSize: theme.fonts.size.sm, fontWeight: '500' },
    modalEmpty: { padding: theme.spacing.xl, alignItems: 'center' },
  });

export default CreateOrderScreen;