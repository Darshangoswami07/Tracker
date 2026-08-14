import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import { StatusCard } from './StatusCard';

export interface NextStep {
  title: string;
  detail?: string;
}

interface NextStepsCardProps {
  steps: NextStep[];
  title?: string;
}

/** Numbered "what happens next?" card used across the approval flow. */
export const NextStepsCard = ({ steps, title = 'What happens next?' }: NextStepsCardProps) => {
  const { colors, fonts, radii } = useAppTheme();

  return (
    <StatusCard icon="sparkles-outline" title={title} bodyStyle={{ gap: 14 }}>
      {steps.map((step, index) => (
        <View key={String(index)} style={styles.row}>
          <View
            style={[
              styles.number,
              {
                backgroundColor: colors.primarySoft,
                borderRadius: radii.md,
              },
            ]}
          >
            <Text style={[styles.numberText, { color: colors.primary, fontSize: fonts.size.md }]}>{index + 1}</Text>
          </View>
          <View style={styles.textCol}>
            <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.size.md, fontWeight: fonts.weight.semibold }]}>
              {step.title}
            </Text>
            {step.detail ? (
              <Text style={[styles.detail, { color: colors.textSecondary, fontSize: fonts.size.sm }]}>{step.detail}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </StatusCard>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  number: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontWeight: '700',
  },
  textCol: {
    flex: 1,
  },
  title: {
    lineHeight: 20,
  },
  detail: {
    marginTop: 2,
    lineHeight: 18,
  },
});