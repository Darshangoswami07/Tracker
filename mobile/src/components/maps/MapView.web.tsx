import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta?: number;
  longitudeDelta?: number;
}

export interface WebMapMarkerProps {
  coordinate: { latitude: number; longitude: number };
  title?: string;
  description?: string;
  pinColor?: string;
  children?: ReactNode;
}

export const Marker = (_props: WebMapMarkerProps) => null;

export interface WebMapPolylineProps {
  coordinates: { latitude: number; longitude: number }[];
  strokeColor?: string;
  strokeWidth?: number;
  geodesic?: boolean;
}

export const Polyline = (_props: WebMapPolylineProps) => null;

export const PROVIDER_GOOGLE = 'google';

interface WebMapProps {
  style?: StyleProp<ViewStyle>;
  provider?: string | null;
  initialRegion?: MapRegion;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  followsUserLocation?: boolean;
  rotateEnabled?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  children?: ReactNode;
}

export default function WebMap(props: WebMapProps) {
  const { style, initialRegion } = props;
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>Map View</Text>
      <Text style={styles.subtitle}>
        Interactive maps are available on the Android and iOS apps.
      </Text>
      {initialRegion && (
        <Text style={styles.coords}>
          {initialRegion.latitude.toFixed(4)}, {initialRegion.longitude.toFixed(4)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#374151',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  coords: {
    marginTop: 8,
    fontSize: 12,
    color: '#9CA3AF',
  },
});
