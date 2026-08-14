import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';
import { useAuthStore } from '../store/authStore';

export interface ViewableAttachment {
  originalFilename: string;
  mimeType: string;
  url: string;
}

interface AttachmentViewerModalProps {
  attachment: ViewableAttachment | null;
  onClose: () => void;
}

/**
 * In-app slip/document viewer. The attachment endpoints require a bearer
 * token (`GRAccessUser`/`CurrentUser` — files are never served from an
 * unauthenticated static path), so a plain `Linking.openURL` opens an
 * external browser with no Authorization header and 401s. Images are
 * rendered via `<Image source={{ uri, headers }}>` — on native iOS/Android
 * builds RN's Image component sends `headers` on the underlying network
 * request, so the slip loads with no manual download step. NOTE:
 * react-native-web maps Image to a plain `<img src>`, which cannot attach
 * custom headers at all, so on the web target the request goes out
 * unauthenticated and fails — this only affects `expo start --web`, not the
 * native app.
 *
 * PDFs/other file types have no in-app renderer available in this project
 * (no PDF/WebView dependency is installed), so they fall back to a
 * best-effort external open with the same auth limitation as before.
 */
export const AttachmentViewerModal = ({ attachment, onClose }: AttachmentViewerModalProps) => {
  const { colors, spacing } = useAppTheme();
  const accessToken = useAuthStore((state) => state.accessToken);
  const [imageStatus, setImageStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const isImage = !!attachment?.mimeType?.startsWith('image/');

  // A fresh `{ uri, headers }` object on every render would make RN's Image
  // treat each render as a brand-new source and reload — if that reload
  // errors (e.g. an expired token), the resulting re-render creates another
  // new object, causing an infinite request loop. Memoizing keeps the same
  // object reference across renders unless the url/token actually changes.
  const imageSource = useMemo(
    () =>
      attachment
        ? { uri: attachment.url, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined }
        : undefined,
    [attachment, accessToken]
  );

  // The modal itself stays mounted between attachments (only `visible`
  // toggles), so status must be reset explicitly whenever a different
  // attachment is opened — otherwise a previous "error"/"ready" state would
  // leak into the next preview.
  useEffect(() => {
    setImageStatus('loading');
  }, [attachment?.url]);

  const handleOpenExternally = () => {
    if (!attachment) return;
    Linking.openURL(attachment.url).catch(() =>
      Alert.alert('Cannot open file', 'No app is available to open this file type.')
    );
  };

  return (
    <Modal visible={!!attachment} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={[styles.safe, { backgroundColor: '#000000' }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {attachment?.originalFilename ?? ''}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {attachment && isImage ? (
            <>
              <Image
                source={imageSource}
                style={styles.image}
                resizeMode="contain"
                onLoadEnd={() => setImageStatus((s) => (s === 'error' ? s : 'ready'))}
                onError={() => setImageStatus('error')}
              />
              {imageStatus === 'loading' && (
                <View style={styles.overlay}>
                  <ActivityIndicator color="#FFFFFF" size="large" />
                </View>
              )}
              {imageStatus === 'error' && (
                <View style={styles.overlay}>
                  <Ionicons name="image-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.errorText}>Could not load this image.</Text>
                </View>
              )}
            </>
          ) : (
            <View style={[styles.overlay, { paddingHorizontal: spacing.xl }]}>
              <Ionicons name="document-text-outline" size={48} color="#9CA3AF" />
              <Text style={styles.errorText}>
                In-app preview isn't available for this file type on mobile yet.
              </Text>
              <TouchableOpacity
                style={[styles.openButton, { backgroundColor: colors.primary }]}
                onPress={handleOpenExternally}
                accessibilityRole="button"
              >
                <Text style={styles.openButtonText}>Try Opening Externally</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { flex: 1, color: '#FFFFFF', fontWeight: '700', fontSize: 15, marginRight: 12 },
  closeBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, position: 'relative' },
  image: { flex: 1, width: '100%', height: '100%' },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: { color: '#D1D5DB', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  openButton: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  openButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});

export default AttachmentViewerModal;
