import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../theme/useAppTheme';

interface ScreenHeadingProps {
  title: string;
  subtitle?: string;
  align?: 'left' | 'center';
}

/** Static heading + subtitle block for the auth screens. */
export const ScreenHeading = ({ title, subtitle, align = 'left' }: ScreenHeadingProps) => {
  const { colors, spacing } = useAppTheme();
  const centered = align === 'center';

  return (
    <View style={centered ? styles.center : styles.left}>
      <Text style={[styles.title, { color: colors.navy, fontSize: 40, lineHeight: 48 }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={[
            styles.subtitle,
            {
              color: colors.textSecondary,
              fontSize: 18,
              marginTop: spacing.sm - 2,
              lineHeight: 26,
            },
          ]}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  left: {
    alignItems: 'flex-start',
  },
  center: {
    alignItems: 'center',
  },
  title: {
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  subtitle: {
    fontWeight: '500',
  },
});
