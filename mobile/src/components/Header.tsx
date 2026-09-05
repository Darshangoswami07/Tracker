import { type ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/useAppTheme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface HeaderAction {
  icon: IoniconName;
  onPress: () => void;
  /** Screenreader label; back buttons default to "Go back". */
  accessibilityLabel?: string;
}

interface HeaderProps {
  title: string;
  leftAction?: HeaderAction;
  rightAction?: HeaderAction & { badge?: number };
  /** A second right-side icon, rendered to the left of `rightAction` (so the
   * primary action stays in the outermost/thumb-friendliest slot). Additive
   * and optional — existing screens that only pass `rightAction` render
   * identically to before. Used for a page-level admin actions entry point
   * (e.g. Delete All) that must stay visible without displacing the
   * existing primary action (e.g. "+ Create"). */
  secondaryRightAction?: HeaderAction;
  showBack?: boolean;
  onBack?: () => void;
}

export const Header = ({ title, leftAction, rightAction, secondaryRightAction, showBack = false, onBack }: HeaderProps) => {
  const { colors, spacing, radii, fonts, shadows } = useAppTheme();

  const styles = StyleSheet.create({
    container: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, ...shadows.sm },
    content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    action: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md },
    // `minWidth: 0` overrides the flexbox default of `min-width: auto` on web
    // (react-native-web maps this to a real CSS flex item) — without it, a
    // long title refuses to shrink below its own content width and pushes
    // past the back button / right actions instead of wrapping in place.
    title: { fontWeight: '800', flex: 1, minWidth: 0, textAlign: 'center' },
    rightActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    iconContainer: { position: 'relative' },
    badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
  });

  const hasBackAction = Boolean(showBack || leftAction);
  const backIcon: IoniconName = showBack ? 'chevron-back' : (leftAction?.icon ?? 'chevron-back');
  const backLabel = showBack ? 'Go back' : (leftAction?.accessibilityLabel ?? 'Go back');
  const handleBackPress = showBack ? onBack : leftAction?.onPress;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, ...shadows.sm }]}>
      <View style={styles.content}>
        {hasBackAction ? (
          <TouchableOpacity
            style={styles.action}
            onPress={handleBackPress}
            activeOpacity={0.7}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
          >
            <Ionicons name={backIcon} size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}

        <Text
          style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.lg }]}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {title}
        </Text>

        <View style={styles.rightActions}>
          {secondaryRightAction && (
            <TouchableOpacity
              style={styles.action}
              onPress={secondaryRightAction.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={secondaryRightAction.accessibilityLabel ?? 'More actions'}
            >
              <Ionicons name={secondaryRightAction.icon} size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          )}
          {rightAction && (
            <TouchableOpacity
              style={styles.action}
              onPress={rightAction.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={rightAction.accessibilityLabel ?? 'Actions'}
            >
              <View style={styles.iconContainer}>
                <Ionicons name={rightAction.icon} size={24} color={colors.textPrimary} />
                {rightAction.badge && rightAction.badge > 0 && (
                  <View style={[styles.badge, { backgroundColor: colors.error, borderRadius: radii.pill }]}>
                    <Text style={styles.badgeText}>{rightAction.badge > 99 ? '99+' : rightAction.badge}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

export default Header;