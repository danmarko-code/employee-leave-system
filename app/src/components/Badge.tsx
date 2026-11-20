import { StyleSheet, View } from 'react-native';
import type { LeaveStatus } from '@leave/shared';
import { AppText } from './Text';
import { colors, fonts, radius, space } from '@/theme/tokens';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, { text: string; background: string; dot: string }> = {
  neutral: { text: colors.muted, background: colors.surfaceMuted, dot: colors.faint },
  info: { text: colors.brandInk, background: colors.brandSoft, dot: colors.brand },
  success: { text: colors.success, background: colors.successSoft, dot: colors.success },
  warning: { text: colors.warning, background: colors.warningSoft, dot: colors.warning },
  danger: { text: colors.danger, background: colors.dangerSoft, dot: colors.danger },
};

/**
 * A pill is reserved for a state, never for a filter. Filters use tabs or a
 * select, so nothing else in the app should render this component.
 */
export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const style = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: style.background }]}>
      <View style={[styles.dot, { backgroundColor: style.dot }]} />
      <AppText variant="micro" style={{ color: style.text, fontFamily: fonts.medium }}>
        {label}
      </AppText>
    </View>
  );
}

const STATUS: Record<LeaveStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  const style = STATUS[status];
  return <Badge label={style.label} tone={style.tone} />;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingVertical: 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
});
