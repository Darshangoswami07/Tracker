import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../../components/maps/MapView';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ActionButton } from '../../components/ActionButton';
import { StatusBadge } from '../../components/StatusBadge';
import { useAppNav } from '../../hooks/useAppNav';

interface NavigationScreenProps {
  route: {
    params: {
      orderId: string;
    };
  };
}

export const NavigationScreen = ({ route }: NavigationScreenProps) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    container: { flex: 1 },
    map: { flex: 1 },
    mapLoading: { flex: 1, backgroundColor: '#F3F4F6' },
    bottomSheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 30,
      maxHeight: '70%',
      ...(Platform.OS === 'web'
        ? { boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.15)' }
        : { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }),
    },
    sheetHandle: {
      width: 40,
      height: 5,
      backgroundColor: '#E5E7EB',
      borderRadius: 3,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 16,
    },
    stepIndicator: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    step: { flex: 1, alignItems: 'center', gap: 6 },
    stepActive: {},
    stepIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    stepLine: { position: 'absolute', top: 16, left: 16, right: -16, height: 2, zIndex: -1 },
    stepText: { alignItems: 'center' },
    stepTitle: { fontSize: 10, fontWeight: '700', textAlign: 'center' },
    stepDesc: { fontSize: 9, textAlign: 'center' },
    currentStepCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      padding: 20,
      backgroundColor: '#F9FAFB',
      marginHorizontal: 20,
      borderRadius: 16,
      marginBottom: 16,
    },
    currentStepIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    currentStepInfo: { flex: 1, gap: 4 },
    currentStepTitle: { fontSize: 16, fontWeight: '800' },
    currentStepDesc: { fontSize: 13, fontWeight: '500' },
    etaInfo: { alignItems: 'flex-end', gap: 2 },
    etaLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    etaValue: { fontSize: 18, fontWeight: '800' },
    actionButtons: { paddingHorizontal: 20, paddingTop: 8, gap: 12 },
    marker: { alignItems: 'center', justifyContent: 'center' },
    markerInner: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' ? { boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)' } : { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }) },
  });

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState({
    latitude: 28.6139,
    longitude: 77.2090,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });
  const [routeCoordinates, setRouteCoordinates] = useState<any[]>([]);
  const [navigationStarted, setNavigationStarted] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [eta, setEta] = useState('Calculating...');
  const [distance, setDistance] = useState('');

  const fetchOrder = async () => {
    if (!accessToken || !orderId) return;
    try {
      const res = await api.get(ENDPOINTS.orders.detail(orderId), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setOrder(res.data.data);
      
      // Set initial region to pickup location
      if (res.data.data.pickupLat && res.data.data.pickupLng) {
        setRegion({
          latitude: res.data.data.pickupLat,
          longitude: res.data.data.pickupLng,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        });
      }
      
      // Generate route coordinates (in real app, use Google Directions API)
      if (res.data.data.pickupLat && res.data.data.pickupLng && res.data.data.deliveryLat && res.data.data.deliveryLng) {
        const coords = [
          { latitude: res.data.data.pickupLat, longitude: res.data.data.pickupLng },
          { latitude: res.data.data.deliveryLat, longitude: res.data.data.deliveryLng },
        ];
        setRouteCoordinates(coords);
        
        // Calculate rough distance and ETA
        const distanceKm = calculateDistance(
          res.data.data.pickupLat, res.data.data.pickupLng,
          res.data.data.deliveryLat, res.data.data.deliveryLng
        );
        setDistance(`${distanceKm.toFixed(1)} km`);
        setEta(`${Math.round(distanceKm * 2 + 5)} min`);
      }
    } catch (error) {
      console.error('Failed to fetch order:', error);
      Alert.alert('Error', 'Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const startNavigation = () => {
    setNavigationStarted(true);
    // In real app, launch Google Maps navigation
    Alert.alert('Navigation Started', 'Opening Google Maps for turn-by-turn directions');
  };

  const startDeliveryNavigation = () => {
    // In real app, launch Google Maps navigation to delivery
    Alert.alert('Navigation Started', 'Opening Google Maps for directions to the delivery location');
  };

  const completeDelivery = () => {
    Alert.alert('Complete Delivery', 'Confirm the package has been delivered', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus('delivered') },
    ]);
  };

  const arriveAtPickup = () => {
    Alert.alert('Arrived at Pickup', 'Confirm you have arrived at the pickup location', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus('pickup') },
    ]);
  };

  const arriveAtDelivery = () => {
    Alert.alert('Arrived at Delivery', 'Confirm you have arrived at the delivery location', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Confirm', onPress: () => updateStatus('delivered') },
    ]);
  };

  const updateStatus = async (status: string) => {
    if (!accessToken || !orderId) return;
    try {
      await api.patch(ENDPOINTS.orders.updateStatus(orderId), { status }, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setCurrentStep(status === 'pickup' ? 1 : 2);
    } catch (error) {
      console.error('Failed to update status:', error);
      Alert.alert('Error', 'Failed to update status');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Navigation" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
        <View style={styles.mapLoading} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Navigation" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>
      </SafeAreaView>
    );
  }

  const steps = [
    { id: 0, title: 'Navigate to Pickup', description: order.pickupAddress, icon: 'navigate-outline' as ComponentProps<typeof Ionicons>['name'], color: '#3B82F6' },
    { id: 1, title: 'Pickup Order', description: 'Collect package from customer', icon: 'package-outline' as ComponentProps<typeof Ionicons>['name'], color: '#8B5CF6' },
    { id: 2, title: 'Navigate to Delivery', description: order.deliveryAddress, icon: 'navigate-outline' as ComponentProps<typeof Ionicons>['name'], color: '#10B981' },
    { id: 3, title: 'Complete Delivery', description: 'Drop off and capture proof', icon: 'checkmark-circle-outline' as ComponentProps<typeof Ionicons>['name'], color: '#10B981' },
  ];

  const currentStepData = steps[currentStep];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Header title={order.orderNumber} leftAction={{ icon: 'chevron-back', onPress: goBack }} />
      </View>

      <View style={styles.container}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={region}
          showsUserLocation={true}
          showsMyLocationButton={true}
          followsUserLocation={false}
          rotateEnabled={false}
          scrollEnabled={true}
          zoomEnabled={true}
        >
          {routeCoordinates.length > 0 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor="#635BFF"
              strokeWidth={4}
              geodesic={true}
            />
          )}
          {order.pickupLat && order.pickupLng && (
            <Marker
              coordinate={{ latitude: order.pickupLat, longitude: order.pickupLng }}
              title="Pickup"
              description={order.pickupAddress}
              pinColor="#10B981"
            >
              <View style={styles.marker}>
                <View style={[styles.markerInner, { backgroundColor: '#10B981' }]}>
                  <Ionicons name="location-outline" size={16} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}
          {order.deliveryLat && order.deliveryLng && (
            <Marker
              coordinate={{ latitude: order.deliveryLat, longitude: order.deliveryLng }}
              title="Delivery"
              description={order.deliveryAddress}
              pinColor="#EF4444"
            >
              <View style={styles.marker}>
                <View style={[styles.markerInner, { backgroundColor: '#EF4444' }]}>
                  <Ionicons name="flag-outline" size={16} color="#FFFFFF" />
                </View>
              </View>
            </Marker>
          )}
        </MapView>

        <View style={styles.bottomSheet}>
          <View style={styles.sheetHandle} />
          
          <View style={styles.stepIndicator}>
            {steps.map((step, index) => (
              <View key={step.id} style={[styles.step, index === currentStep && styles.stepActive]}>
                <View style={[styles.stepIcon, { backgroundColor: index <= currentStep ? step.color : '#E5E7EB', borderRadius: radii.pill }]}>
                  <Ionicons name={step.icon} size={16} color={index <= currentStep ? '#FFFFFF' : '#9CA3AF'} />
                </View>
                <View style={styles.stepText}>
                  <Text style={[styles.stepTitle, { color: index <= currentStep ? colors.textPrimary : colors.textMuted, fontWeight: index === currentStep ? '800' : '600' }]}>{step.title}</Text>
                  <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>{step.description}</Text>
                </View>
                {index < steps.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: index < currentStep ? step.color : '#E5E7EB' }]} />
                )}
              </View>
            ))}
          </View>

          <View style={styles.currentStepCard}>
            <View style={[styles.currentStepIcon, { backgroundColor: currentStepData.color + '15', borderRadius: radii.md }]}>
              <Ionicons name={currentStepData.icon} size={24} color={currentStepData.color} />
            </View>
            <View style={styles.currentStepInfo}>
              <Text style={[styles.currentStepTitle, { color: colors.textPrimary }]}>{currentStepData.title}</Text>
              <Text style={[styles.currentStepDesc, { color: colors.textSecondary }]}>{currentStepData.description}</Text>
            </View>
            <View style={styles.etaInfo}>
              <Text style={[styles.etaLabel, { color: colors.textMuted }]}>ETA</Text>
              <Text style={[styles.etaValue, { color: colors.textPrimary }]}>{eta}</Text>
            </View>
          </View>

          <View style={styles.actionButtons}>
            {currentStep === 0 && !navigationStarted && (
              <ActionButton label="Start Navigation" icon="navigate" variant="primary" size="lg" fullWidth onPress={startNavigation} />
            )}
            {currentStep === 0 && navigationStarted && (
              <ActionButton label="Arrived at Pickup" icon="location" variant="primary" size="lg" fullWidth onPress={arriveAtPickup} />
            )}
            {currentStep === 1 && (
              <ActionButton label="Start Delivery Navigation" icon="navigate" variant="secondary" size="lg" fullWidth onPress={startDeliveryNavigation} />
            )}
            {currentStep === 2 && (
              <ActionButton label="Arrived at Delivery" icon="location" variant="primary" size="lg" fullWidth onPress={arriveAtDelivery} />
            )}
            {currentStep === 3 && (
              <ActionButton label="Complete Delivery" icon="checkmark" variant="primary" size="lg" fullWidth onPress={completeDelivery} />
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default NavigationScreen;