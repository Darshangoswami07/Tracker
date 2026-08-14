import { Ionicons } from '@expo/vector-icons';
import { ComponentProps, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, Platform } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';

export interface ApprovalTimelineStep {
  key: string;
  label: string;
  subtitle?: string;
}

interface ApprovalTimelineProps {
  steps: ApprovalTimelineStep[];
  /** Index of the step currently in progress (0-based). */
  activeIndex: number;
}

/** Vertical approval-progress timeline with done / active / pending states. */
export const ApprovalTimeline = ({ steps, activeIndex }: ApprovalTimelineProps) => {
  const last = steps.length - 1;

  return (
    <View>
      {steps.map((step, index) => (
        <StepRow
          key={step.key}
          step={step}
          done={index < activeIndex}
          active={index === activeIndex}
          isLast={index === last}
        />
      ))}
    </View>
  );
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const StepRow = ({ step, done, active, isLast }: { step: ApprovalTimelineStep; done: boolean; active: boolean; isLast: boolean }) => {
  const { colors, fonts } = useAppTheme();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [active, pulse]);

  let iconName: IoniconName;
  if (done) iconName = 'checkmark-circle';
  else if (active) iconName = 'hourglass-outline';
  else iconName = 'ellipse-outline';

  const color = done ? colors.success : active ? colors.warning : colors.textMuted;
  const labelColor = done || active ? colors.textPrimary : colors.textSecondary;

  return (
    <View style={styles.row}>
      <View style={styles.railCol}>
        {!isLast ? <View style={[styles.rail, { backgroundColor: done ? colors.success : colors.border }]} /> : null}
        <Animated.View
          style={[
            styles.dot,
            active && { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }] },
          ]}
        >
          <Ionicons name={iconName} size={25} color={color} />
        </Animated.View>
      </View>

      <View style={styles.content}>
        <Text style={[styles.label, { color: labelColor, fontSize: fonts.size.md, fontWeight: fonts.weight.semibold }]}>
          {step.label}
        </Text>
        {step.subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted, fontSize: fonts.size.sm }]}>{step.subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  railCol: {
    alignItems: 'center',
    width: 28,
  },
  rail: {
    width: 2,
    height: 42,
    borderRadius: 1,
  },
  dot: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  content: {
    flex: 1,
    paddingBottom: 20,
  },
  label: {
    marginTop: 6,
  },
  subtitle: {
    marginTop: 2,
  },
});