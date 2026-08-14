import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, PropsWithChildren } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

interface StatusCardProps extends PropsWithChildren {
  title?: string;
  icon?: IconName;
  iconColor?: string;
  iconBackground?: string;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  footer?: React.ReactNode;
}

/** Rounded elevated card used for status pills, detail lists and info blocks. */
export const StatusCard = ({
  title,
  icon,
  iconColor,
  iconBackground,
  style,
  bodyStyle,
  footer,
  children,
}: StatusCardProps) => {
  const { colors, spacing, radii, shadows } = useAppTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.xl,
          padding: spacing.xl,
          ...shadows.md,
        },
        style,
      ]}
    >
      {title ? (
        <View style={styles.header}>
          {icon ? (
            <View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: iconBackground ?? colors.primarySoft,
                  borderRadius: radii.md,
                },
              ]}
            >
              <Ionicons name={icon} size={18} color={iconColor ?? colors.primary} />
            </View>
          ) : null}
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        </View>
      ) : null}

      <View style={bodyStyle}>{children}</View>

      {footer ? <View style={[styles.footer, { borderTopColor: colors.border }]}>{footer}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  iconBubble: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
  },
  footer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
  },
});
