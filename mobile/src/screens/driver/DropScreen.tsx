import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, Keyboard, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ActionButton } from '../../components/ActionButton';
import { StatusBadge } from '../../components/StatusBadge';
import { toAppError } from '../../services/errorMapper';
import { useAppNav } from '../../hooks/useAppNav';

interface DropScreenProps {
  route: {
    params: {
      orderId: string;
    };
  };
}

export const DropScreen = ({ route }: DropScreenProps) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack, navigate } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    spinner: { width: 48, height: 48, borderWidth: 3, borderColor: '#E5E7EB', borderTopColor: '#635BFF', borderRadius: 24 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    orderCard: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 20, marginBottom: spacing.lg, ...shadows.md },
    orderNumber: { fontSize: fonts.size.lg, fontWeight: '800', marginBottom: 4 },
    customerName: { fontSize: fonts.size.md, fontWeight: '500', marginBottom: 12 },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    address: { fontSize: fonts.size.md, fontWeight: '500', flex: 1 },
    otpSection: { marginTop: spacing.lg },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.sm },
    sectionDesc: { fontSize: fonts.size.sm, fontWeight: '500', marginBottom: spacing.lg },
    otpContainer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: spacing.lg },
    otpBox: { width: 52, height: 52, borderWidth: 2, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
    otpChar: { fontSize: 24, fontWeight: '800' },
    otpInputContainer: { position: 'absolute', width: 1, height: 1, opacity: 0 },
    otpInput: { width: 1, height: 1, fontSize: 0, color: 'transparent', textAlign: 'center' },
    resendText: { alignSelf: 'center', marginTop: spacing.md, paddingVertical: spacing.sm },
    resendLabel: { fontSize: fonts.size.sm, fontWeight: '600' },
    proofInfo: { marginTop: spacing.xl },
    proofItems: { gap: spacing.md },
    proofCard: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
    proofIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    proofText: { flex: 1, gap: 4 },
    proofHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    proofLabel: { fontSize: fonts.size.md, fontWeight: '700' },
    requiredBadge: { fontSize: fonts.size.xs, fontWeight: '800', color: '#EF4444', backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
    proofDesc: { fontSize: fonts.size.sm, fontWeight: '500' },
    successCard: { backgroundColor: '#F0FDF4', borderRadius: radii.xl, padding: 24, alignItems: 'center', gap: 16, marginTop: spacing.lg },
    successIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
    successTitle: { fontSize: fonts.size.xl, fontWeight: '800' },
    successDesc: { fontSize: fonts.size.md, fontWeight: '500', textAlign: 'center', marginHorizontal: spacing.lg },
  });

  const ProofItem = ({ icon, label, desc, required }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; desc: string; required: boolean }) => {
    return (
      <View style={[styles.proofCard, { backgroundColor: colors.surface, borderRadius: radii.lg, ...shadows.sm }]}>
        <View style={[styles.proofIcon, { backgroundColor: '#635BFF15', borderRadius: radii.md }]}>
          <Ionicons name={icon} size={22} color="#635BFF" />
        </View>
        <View style={styles.proofText}>
          <View style={styles.proofHeader}>
            <Text style={[styles.proofLabel, { color: colors.textPrimary }]}>{label}</Text>
            {required && <Text style={styles.requiredBadge}>Required</Text>}
          </View>
          <Text style={[styles.proofDesc, { color: colors.textSecondary }]}>{desc}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
    );
  };

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [dropConfirmed, setDropConfirmed] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  const fetchOrder = async () => {
    if (!accessToken || !orderId) return;
    try {
      const res = await api.get(ENDPOINTS.orders.detail(orderId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOrder(res.data.data);
    } catch (error) {
      console.error('Failed to fetch order:', error);
      Alert.alert('Error', 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const verifyOTP = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the 6-digit OTP');
      return;
    }
    setVerifying(true);
    try {
      await api.post(`${ENDPOINTS.driver}/orders/${orderId}/verify-delivery`, { otp }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setDropConfirmed(true);
      await api.patch(ENDPOINTS.orders.updateStatus(orderId), { status: 'delivered' }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      Alert.alert('Success', 'Order delivered successfully!');
    } catch (error) {
      console.error('Failed to verify OTP:', error);
      Alert.alert('Error', toAppError(error).message);
    } finally {
      setVerifying(false);
    }
  };

  const resendOTP = async () => {
    try {
      await api.post(`${ENDPOINTS.driver}/orders/${orderId}/resend-otp`, {}, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      Alert.alert('OTP Sent', 'A new OTP has been sent to the customer');
    } catch (error) {
      console.error('Failed to resend OTP:', error);
      Alert.alert('Error', 'Failed to resend OTP');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Delivery Drop" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <View style={styles.loadingContainer}>
          <Animated.View style={[styles.spinner, { opacity: fadeAnim }]} />
        </View>
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Delivery Drop" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
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
          <Header title="Delivery Drop" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <StatusBadge status={order.status} size="lg" />

          <View style={styles.orderCard}>
            <Text style={[styles.orderNumber, { color: colors.textPrimary }]}>{order.orderNumber}</Text>
            <Text style={[styles.customerName, { color: colors.textSecondary }]}>{order.customerName}</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={16} color="#EF4444" />
              <Text style={[styles.address, { color: colors.textPrimary }]}>{order.deliveryAddress}</Text>
            </View>
          </View>

          {dropConfirmed ? (
            <View style={styles.successCard}>
              <View style={[styles.successIcon, { backgroundColor: '#10B98115', borderRadius: radii.pill }]}>
                <Ionicons name="checkmark" size={28} color="#10B981" />
              </View>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>Delivery Completed!</Text>
              <Text style={[styles.successDesc, { color: colors.textSecondary }]}>The package has been delivered. Capture proof of delivery to complete.</Text>
              <ActionButton
                label="Capture Proof of Delivery"
                icon="camera"
                variant="primary"
                size="lg"
                fullWidth
                onPress={() => navigate('DeliveryProof', { orderId })}
              />
            </View>
          ) : (
            <>
              <View style={styles.otpSection}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Customer Verification</Text>
                <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Enter the 6-digit OTP shared by the customer</Text>
                
                <View style={styles.otpContainer}>
                  {[0,1,2,3,4,5].map((index) => (
                    <View key={index} style={[styles.otpBox, { borderColor: otp[index] ? colors.primary : '#E5E7EB', backgroundColor: otp[index] ? '#635BFF10' : colors.surface }]}>
                      <Text style={[styles.otpChar, { color: otp[index] ? colors.primary : colors.textPrimary }]}>{otp[index] || ''}</Text>
                    </View>
                  ))}
                </View>
                
                <View style={styles.otpInputContainer}>
                  <TextInput
                    style={styles.otpInput}
                    value={otp}
                    onChangeText={(text) => setOtp(text.slice(0, 6))}
                    maxLength={6}
                    keyboardType="number-pad"
                    autoFocus
                    caretHidden
                  />
                </View>

                <ActionButton
                  label={verifying ? 'Verifying...' : 'Verify & Complete Delivery'}
                  icon={verifying ? 'refresh' : 'checkmark-circle'}
                  variant="primary"
                  size="lg"
                  fullWidth
                  onPress={verifyOTP}
                  disabled={verifying || otp.length !== 6}
                  loading={verifying}
                />

                <TouchableOpacity style={styles.resendText} onPress={resendOTP} disabled={verifying}>
                  <Text style={[styles.resendLabel, { color: colors.primary }]}>Resend OTP</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.proofInfo}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Proof of Delivery Required</Text>
                <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>After verification, you'll need to capture a photo and/or customer signature</Text>
                
                <View style={styles.proofItems}>
                  <ProofItem icon="image-outline" label="Delivery Photo" desc="Photo of package at destination" required />
                  <ProofItem icon="create-outline" label="Customer Signature" desc="Digital signature from recipient" required />
                  <ProofItem icon="document-text-outline" label="Delivery Notes" desc="Optional notes about delivery" required={false} />
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

export default DropScreen;