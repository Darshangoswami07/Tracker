import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Alert, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { Header } from '../../components/Header';
import { ActionButton } from '../../components/ActionButton';
import { StatusBadge } from '../../components/StatusBadge';
import * as ImagePicker from 'expo-image-picker';
import { useAppNav } from '../../hooks/useAppNav';

interface DeliveryProofScreenProps {
  route: {
    params: {
      orderId: string;
    };
  };
}

export const DeliveryProofScreen = ({ route }: DeliveryProofScreenProps) => {
  const { orderId } = route.params;
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { goBack } = useAppNav();
  const accessToken = useAuthStore((state) => state.accessToken);

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    header: { paddingTop: 8 },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    spinner: { width: 48, height: 48, borderWidth: 3, borderColor: '#E5E7EB', borderTopColor: '#635BFF', borderRadius: 24 },
    scrollContent: { paddingBottom: 40, paddingHorizontal: spacing.lg },
    orderHeader: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: 20, marginBottom: spacing.lg, ...shadows.md },
    orderNumber: { fontSize: fonts.size.lg, fontWeight: '800', marginBottom: 4 },
    customerName: { fontSize: fonts.size.md, fontWeight: '500', marginBottom: 12 },
    addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    address: { fontSize: fonts.size.md, fontWeight: '500', flex: 1 },
    section: { marginBottom: spacing.xl },
    sectionTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.sm },
    sectionDesc: { fontSize: fonts.size.sm, fontWeight: '500', marginBottom: spacing.lg },
    photoBox: { aspectRatio: 4/3, borderWidth: 2, borderRadius: radii.lg, overflow: 'hidden' },
    photoPreview: { flex: 1, position: 'relative' },
    photoImage: { width: '100%', height: '100%' },
    photoAction: { position: 'absolute', top: 12, right: 12 },
    photoActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    photoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    photoHint: { fontSize: fonts.size.md, fontWeight: '600' },
    signatureBox: { height: 200, borderWidth: 2, borderRadius: radii.lg, overflow: 'hidden' },
    signaturePreview: { flex: 1 },
    signatureImage: { width: '100%', height: '100%' },
    signatureAction: { position: 'absolute', top: 12, right: 12 },
    signatureActionBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    signaturePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    signatureHint: { fontSize: fonts.size.md, fontWeight: '600' },
    notesInput: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: 16, fontSize: fonts.size.md, color: colors.textPrimary, borderWidth: 1, borderColor: '#E5E7EB' },
    requirements: { marginTop: spacing.lg, padding: 16, backgroundColor: colors.surfaceMuted, borderRadius: radii.lg },
    reqTitle: { fontSize: fonts.size.md, fontWeight: '800', marginBottom: spacing.md },
    reqRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.sm },
    reqIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
    reqText: { fontSize: fonts.size.sm, fontWeight: '500', flex: 1 },
  });

  const RequirementItem = ({ text, met }: { text: string; met: boolean }) => {
    return (
      <View style={styles.reqRow}>
        <View style={[styles.reqIcon, { backgroundColor: met ? '#10B98115' : '#F59E0B15', borderRadius: radii.pill }]}>
          <Ionicons name={met ? 'checkmark' : 'time'} size={16} color={met ? '#10B981' : '#F59E0B'} />
        </View>
        <Text style={[styles.reqText, { color: met ? colors.textSecondary : colors.textPrimary }]}>{text}</Text>
      </View>
    );
  };

  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
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

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    return status === 'granted';
  };

  const requestMediaLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    return status === 'granted';
  };

  const takePhoto = async () => {
    const granted = await requestCameraPermission();
    if (!granted) {
      Alert.alert('Permission Required', 'Camera permission is required to take photos');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const pickPhoto = async () => {
    const granted = await requestMediaLibraryPermission();
    if (!granted) {
      Alert.alert('Permission Required', 'Gallery permission is required to select photos');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled) {
      setPhoto(result.assets[0].uri);
    }
  };

  const openSignaturePad = () => {
    // In a real app, this would open a signature capture component
    Alert.alert('Signature Capture', 'Opening signature pad...');
    // Simulate signature capture
    setTimeout(() => {
      setSignature('data:image/png;base64,mock_signature_data');
    }, 1000);
  };

  const submitProof = async () => {
    if (!photo && !signature) {
      Alert.alert('Required', 'Please capture at least a delivery photo or customer signature');
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('orderId', orderId);
      formData.append('notes', notes);
      
      if (photo) {
        formData.append('image', {
          uri: photo,
          type: 'image/jpeg',
          name: `delivery_${orderId}_${Date.now()}.jpg`,
        } as any);
      }
      
      if (signature) {
        formData.append('signature', {
          uri: signature,
          type: 'image/png',
          name: `signature_${orderId}_${Date.now()}.png`,
        } as any);
      }

      await api.post(`${ENDPOINTS.driver}/orders/${orderId}/proof`, formData, {
        headers: { 
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      
      Alert.alert('Success', 'Proof of delivery submitted successfully!');
    } catch (error) {
      console.error('Failed to submit proof:', error);
      Alert.alert('Error', 'Failed to submit proof of delivery');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Header title="Proof of Delivery" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
          <Header title="Proof of Delivery" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
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
          <Header title="Proof of Delivery" leftAction={{ icon: 'chevron-back', onPress: goBack }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.orderHeader}>
            <Text style={[styles.orderNumber, { color: colors.textPrimary }]}>{order.orderNumber}</Text>
            <Text style={[styles.customerName, { color: colors.textSecondary }]}>{order.customerName}</Text>
            <View style={styles.addressRow}>
              <Ionicons name="location-outline" size={16} color="#EF4444" />
              <Text style={[styles.address, { color: colors.textPrimary }]}>{order.deliveryAddress}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Delivery Photo</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Capture a photo of the delivered package at the destination</Text>
            
            <TouchableOpacity 
              style={[
                styles.photoBox, 
                { 
                  borderColor: photo ? colors.primary : '#E5E7EB',
                  backgroundColor: photo ? '#635BFF10' : colors.surface,
                } 
              ]}
              onPress={photo ? () => {} : () => { Alert.alert('Add Photo', 'Choose an option', [
                { text: 'Take Photo', onPress: takePhoto },
                { text: 'Choose from Gallery', onPress: pickPhoto },
                { text: 'Cancel', style: 'cancel' }
              ]) }}
            >
              {photo ? (
                <View style={styles.photoPreview}>
                  <Image source={{ uri: photo }} style={styles.photoImage} />
                  <TouchableOpacity style={styles.photoAction} onPress={(e) => { e.stopPropagation(); setPhoto(null); }}>
                    <View style={[styles.photoActionBtn, { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radii.pill }]}>
                      <Ionicons name="trash" size={20} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.photoHint, { color: colors.textMuted }]}>Tap to add photo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Customer Signature</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Capture the recipient's digital signature</Text>
            
            <TouchableOpacity 
              style={[
                styles.signatureBox, 
                { 
                  borderColor: signature ? colors.primary : '#E5E7EB',
                  backgroundColor: signature ? '#635BFF10' : colors.surface,
                } 
              ]}
              onPress={openSignaturePad}
            >
              {signature ? (
                <View style={styles.signaturePreview}>
                  <Image source={{ uri: signature }} style={styles.signatureImage} />
                  <TouchableOpacity style={styles.signatureAction} onPress={(e) => { e.stopPropagation(); setSignature(null); }}>
                    <View style={[styles.signatureActionBtn, { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radii.pill }]}>
                      <Ionicons name="trash" size={20} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.signaturePlaceholder}>
                  <Ionicons name="create-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.signatureHint, { color: colors.textMuted }]}>Tap to capture signature</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Delivery Notes</Text>
            <Text style={[styles.sectionDesc, { color: colors.textSecondary }]}>Optional notes about the delivery</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Enter any delivery notes..."
              multiline
              numberOfLines={4}
            />
          </View>

          <View style={styles.requirements}>
            <Text style={[styles.reqTitle, { color: colors.textPrimary }]}>Requirements</Text>
            <RequirementItem text="Delivery photo is mandatory" met={!!photo} />
            <RequirementItem text="Customer signature is mandatory" met={!!signature} />
            <RequirementItem text="Notes are optional" met={true} />
          </View>

          <ActionButton
            label={submitting ? 'Submitting...' : 'Submit Proof of Delivery'}
            icon={submitting ? 'refresh' : 'checkmark-circle'}
            variant="primary"
            size="lg"
            fullWidth
            onPress={submitProof}
            disabled={submitting || !photo || !signature}
            loading={submitting}
          />
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
};

export default DeliveryProofScreen;