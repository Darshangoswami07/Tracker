import { useEffect, useState } from 'react';
import { Animated, StyleSheet, ScrollView, Text, TouchableOpacity, View, TextInput, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ShimmerCard } from '../../components/ShimmerCard';
import { EmptyState } from '../../components/EmptyState';
import { ActionButton } from '../../components/ActionButton';
import { useAppNav } from '../../hooks/useAppNav';

export const CustomerCreateOrderScreen = () => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const styles = StyleSheet.create({
    safe: { flex: 1 },
    headerContainer: { paddingTop: 8 },
    header: { paddingHorizontal: spacing.lg, paddingBottom: 8 },
    formHeader: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: 4 },
    formTitle: { fontSize: fonts.size.xl, fontWeight: '800', color: colors.textPrimary },
    formSubtitle: { fontSize: fonts.size.sm, fontWeight: '500', color: colors.textSecondary },
    scrollContent: { paddingBottom: 100, paddingHorizontal: spacing.lg },
    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.md },
    addressCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderRadius: radii.xl, padding: 16, ...shadows.sm },
    addressIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    addressContent: { flex: 1, gap: 4 },
    addressLabel: { fontSize: fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    addressValue: { fontSize: fonts.size.md, fontWeight: '500' },
    detailCard: { padding: 20, gap: spacing.lg },
    textInput: { backgroundColor: colors.background, borderRadius: radii.lg, padding: 16, fontSize: fonts.size.md, color: colors.textPrimary, borderWidth: 1, borderColor: '#E5E7EB' },
    textArea: { padding: 16, fontSize: fonts.size.md, color: colors.textPrimary },
    optionChip: { paddingHorizontal: 16, paddingVertical: 10, borderWidth: 2, borderRadius: radii.md },
    optionText: { fontSize: fonts.size.md, fontWeight: '700' },
    fieldLabel: { fontSize: fonts.size.sm, fontWeight: '700', marginBottom: spacing.sm, color: colors.textSecondary },
    scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    scheduleIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    scheduleContent: { flex: 1, gap: 2 },
    scheduleLabel: { fontSize: fonts.size.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    scheduleValue: { fontSize: fonts.size.md, fontWeight: '600' },
  });
  const accessToken = useAuthStore((state) => state.accessToken);

  const [formData, setFormData] = useState({
    pickupAddress: '',
    deliveryAddress: '',
    packageType: 'document',
    weight: '',
    dimensions: '',
    priority: 'normal',
    notes: '',
    scheduledTime: '',
  });
  const [addresses, setAddresses] = useState<any[]>([]);
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  useEffect(() => {
    fetchAddresses();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const fetchAddresses = async () => {
    if (!accessToken) return;
    try {
      const res = await api.get(`${ENDPOINTS.customer}/addresses`);
      setAddresses(res.data.data.items || []);
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
    }
  };

  const handleSubmit = async () => {
    if (!formData.pickupAddress || !formData.deliveryAddress) {
      Alert.alert('Missing Information', 'Please enter both pickup and delivery addresses');
      return;
    }
    setSubmitting(true);
    try {
      // NOTE: `POST /customer/orders` does not exist on the backend yet.
      // Every Order row requires a companyId (which courier company fulfills
      // it), and this form has no company picker — that's a product
      // decision (auto-assign one? let the customer choose?), not something
      // to guess at while fixing the unrelated client-side bug below.
      await api.post(`${ENDPOINTS.customer}/orders`, formData);
      Alert.alert('Success', 'Order created successfully!');
      // Reset form
      setFormData({
        pickupAddress: '',
        deliveryAddress: '',
        packageType: 'document',
        weight: '',
        dimensions: '',
        priority: 'normal',
        notes: '',
        scheduledTime: '',
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
          <Header title="New Delivery" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View style={styles.headerContainer}>
        <View style={styles.header}>
          <Header title="New Delivery" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Create New Delivery</Text>
            <Text style={styles.formSubtitle}>Fill in the details below to schedule a pickup</Text>
          </View>
        </Animated.View>
      </Animated.View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={{
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim,
          }}
        >
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Pickup Location</Text>
            <TouchableOpacity style={styles.addressCard} onPress={() => setShowPickupModal(true)}>
              <View style={[styles.addressIcon, { backgroundColor: '#10B98115', borderRadius: radii.md }]}>
                <Ionicons name="location-outline" size={22} color="#10B981" />
              </View>
              <View style={styles.addressContent}>
                <Text style={[styles.addressLabel, { color: colors.textMuted }]}>Pickup Address</Text>
                <Text style={[styles.addressValue, { color: formData.pickupAddress ? colors.textPrimary : colors.textMuted }]}>{formData.pickupAddress || 'Tap to select or enter address'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Delivery Location</Text>
            <TouchableOpacity style={styles.addressCard} onPress={() => setShowDeliveryModal(true)}>
              <View style={[styles.addressIcon, { backgroundColor: '#EF444415', borderRadius: radii.md }]}>
                <Ionicons name="location-outline" size={22} color="#EF4444" />
              </View>
              <View style={styles.addressContent}>
                <Text style={[styles.addressLabel, { color: colors.textMuted }]}>Delivery Address</Text>
                <Text style={[styles.addressValue, { color: formData.deliveryAddress ? colors.textPrimary : colors.textMuted }]}>{formData.deliveryAddress || 'Tap to select or enter address'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Package Details</Text>
            <View style={[styles.detailCard, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}>
              <FormField label="Package Type" icon="cube-outline">
                <TouchableOpacity style={[styles.optionChip, { borderColor: formData.packageType === 'document' ? '#635BFF' : '#E5E7EB', backgroundColor: formData.packageType === 'document' ? '#635BFF15' : 'transparent' }]} onPress={() => setFormData({...formData, packageType: 'document'})}>
                  <Text style={[styles.optionText, { color: formData.packageType === 'document' ? '#635BFF' : colors.textPrimary }]}>Document</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionChip, { borderColor: formData.packageType === 'parcel' ? '#635BFF' : '#E5E7EB', backgroundColor: formData.packageType === 'parcel' ? '#635BFF15' : 'transparent' }]} onPress={() => setFormData({...formData, packageType: 'parcel'})}>
                  <Text style={[styles.optionText, { color: formData.packageType === 'parcel' ? '#635BFF' : colors.textPrimary }]}>Parcel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionChip, { borderColor: formData.packageType === 'fragile' ? '#635BFF' : '#E5E7EB', backgroundColor: formData.packageType === 'fragile' ? '#635BFF15' : 'transparent' }]} onPress={() => setFormData({...formData, packageType: 'fragile'})}>
                  <Text style={[styles.optionText, { color: formData.packageType === 'fragile' ? '#635BFF' : colors.textPrimary }]}>Fragile</Text>
                </TouchableOpacity>
              </FormField>

              <FormField label="Weight (kg)" icon="scale-outline">
                <TextInput style={styles.textInput} placeholder="Enter weight" value={formData.weight} onChangeText={(v) => setFormData({...formData, weight: v})} keyboardType="numeric" />
              </FormField>

              <FormField label="Dimensions (LxWxH cm)" icon="resize-outline">
                <TextInput style={styles.textInput} placeholder="e.g., 30x20x15" value={formData.dimensions} onChangeText={(v) => setFormData({...formData, dimensions: v})} />
              </FormField>

              <FormField label="Priority" icon="flash-outline">
                <TouchableOpacity style={[styles.optionChip, { borderColor: formData.priority === 'normal' ? '#635BFF' : '#E5E7EB', backgroundColor: formData.priority === 'normal' ? '#635BFF15' : 'transparent' }]} onPress={() => setFormData({...formData, priority: 'normal'})}>
                  <Text style={[styles.optionText, { color: formData.priority === 'normal' ? '#635BFF' : colors.textPrimary }]}>Normal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionChip, { borderColor: formData.priority === 'express' ? '#635BFF' : '#E5E7EB', backgroundColor: formData.priority === 'express' ? '#635BFF15' : 'transparent' }]} onPress={() => setFormData({...formData, priority: 'express'})}>
                  <Text style={[styles.optionText, { color: formData.priority === 'express' ? '#635BFF' : colors.textPrimary }]}>Express</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.optionChip, { borderColor: formData.priority === 'urgent' ? '#635BFF' : '#E5E7EB', backgroundColor: formData.priority === 'urgent' ? '#635BFF15' : 'transparent' }]} onPress={() => setFormData({...formData, priority: 'urgent'})}>
                  <Text style={[styles.optionText, { color: formData.priority === 'urgent' ? '#635BFF' : colors.textPrimary }]}>Urgent</Text>
                </TouchableOpacity>
              </FormField>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Additional Notes</Text>
            <TextInput
              style={[styles.textArea, { backgroundColor: colors.surface, borderRadius: radii.xl, ...shadows.sm }]}
              placeholder="Any special instructions for the driver..."
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
                <Text style={[styles.scheduleValue, { color: formData.scheduledTime ? colors.textPrimary : colors.textMuted }]}>{formData.scheduledTime || 'As soon as possible'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ActionButton
            label={submitting ? 'Creating...' : 'Create Delivery'}
            icon={submitting ? 'refresh' : 'paper-plane'}
            variant="primary"
            size="lg"
            fullWidth
            onPress={handleSubmit}
            disabled={submitting || !formData.pickupAddress || !formData.deliveryAddress}
            loading={submitting}
          />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
};

const FormField = ({ label, icon, children }: { label: string; icon: string; children: React.ReactNode }) => {
  const { colors, spacing, radii, fonts } = useAppTheme();
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[{ fontSize: fonts.size.sm, fontWeight: '700', marginBottom: spacing.sm, color: colors.textSecondary }, { color: colors.textPrimary }]}>{label}</Text>
      {children}
    </View>
  );
};

export default CustomerCreateOrderScreen;