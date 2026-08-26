import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../theme/useAppTheme';
import { useAuthStore } from '../../store/authStore';
import { Logo } from '../../components/Logo';

export const ApprovalPendingScreen = () => {
  const { t } = useTranslation();
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();
  const { status } = useAuthStore();

  const styles = StyleSheet.create({
    safe: { flex: 1 },
    container: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: 'center', alignItems: 'center' },
    iconContainer: { marginBottom: spacing.xxl },
    statusIcon: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
    content: { width: '100%', alignItems: 'center', marginBottom: spacing.xl },
    title: { fontSize: fonts.size.xxl, fontWeight: '900', color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.md, letterSpacing: -0.5 },
    subtitle: { fontSize: fonts.size.md, color: colors.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xl },
    infoCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.xl },
    infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
    infoText: { flex: 1, color: colors.textSecondary, fontSize: fonts.size.md, lineHeight: 22 },
    statusIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: '#F59E0B15', borderRadius: radii.pill },
    statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
    statusText: { color: '#F59E0B', fontWeight: '700', fontSize: fonts.size.md },
    actions: { paddingTop: spacing.lg, borderTopWidth: 1, borderTopColor: '#F3F4F6', width: '100%', alignItems: 'center' },
    helpText: { color: colors.textMuted, fontSize: fonts.size.md },
    helpLink: { color: '#635BFF', fontWeight: '700', fontSize: fonts.size.md },
  });

  const [fadeAnim] = useState(new Animated.Value(0));
  const [scaleAnim] = useState(new Animated.Value(0.8));
  const [pulseAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [fadeAnim, scaleAnim, pulseAnim]);

  const handleBackToLogin = () => {
    // Navigate back to login
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }}
      >
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Animated.View
              style={{
                transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
              }}
            >
              <View style={[styles.statusIcon, { backgroundColor: '#F59E0B15', borderRadius: radii.pill }]}>
                <Ionicons name="time-outline" size={48} color="#F59E0B" />
              </View>
            </Animated.View>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>{t('auth.accountUnderReview')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.accountPendingApproval')}
            </Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={20} color="#635BFF" />
                <Text style={styles.infoText}>{t('auth.willNotifyViaEmail')}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="mail-outline" size={20} color="#635BFF" />
                <Text style={styles.infoText}>{t('auth.checkInboxSpam')}</Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="shield-outline" size={20} color="#635BFF" />
                <Text style={styles.infoText}>{t('auth.dataSecureNotShared')}</Text>
              </View>
            </View>

            <View style={styles.statusIndicator}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{t('common.pendingApproval')}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <Text style={styles.helpText}>{t('common.needHelp')} </Text>
            <Text style={styles.helpLink}>{t('common.contactSupport')}</Text>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
};

export default ApprovalPendingScreen;