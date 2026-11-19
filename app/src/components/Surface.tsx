import type { ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LeaveStatus } from '@leave/shared';
import { AppText } from './Text';
import { colors, fonts, radius, shadow, space } from '@/theme/tokens';
import { initials } from '@/lib/format';

export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  padded?: boolean;
}) {
  return <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>;
}

export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionText}>
        <AppText variant="title">{title}</AppText>
        {detail ? (
          <AppText variant="small" tone="muted">
            {detail}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const STATUS: Record<
  LeaveStatus,
  { label: string; color: string; background: string }
> = {
  pending: { label: 'Pending', color: colors.warning, background: colors.warningSoft },
  approved: { label: 'Approved', color: colors.success, background: colors.successSoft },
  rejected: { label: 'Rejected', color: colors.danger, background: colors.dangerSoft },
};

export function StatusPill({ status }: { status: LeaveStatus }) {
  const style = STATUS[status];
  return (
    <View style={[styles.pill, { backgroundColor: style.background }]}>
      <View style={[styles.pillDot, { backgroundColor: style.color }]} />
      <AppText variant="micro" style={{ color: style.color, fontFamily: fonts.medium }}>
        {style.label}
      </AppText>
    </View>
  );
}

export function Avatar({
  name,
  size = 'md',
  tone = 'light',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
}) {
  const dimensions = size === 'lg' ? 56 : size === 'sm' ? 30 : 38;
  return (
    <View
      style={[
        styles.avatar,
        {
          width: dimensions,
          height: dimensions,
          borderRadius: radius.pill,
          backgroundColor: tone === 'dark' ? 'rgba(255,255,255,0.12)' : colors.brandSoft,
        },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <AppText
        variant={size === 'lg' ? 'title' : size === 'sm' ? 'micro' : 'small'}
        style={{
          color: tone === 'dark' ? colors.onDark : colors.brandInk,
          fontFamily: fonts.semibold,
        }}
      >
        {initials(name)}
      </AppText>
    </View>
  );
}

type NoticeTone = 'error' | 'info' | 'success' | 'warning';

const NOTICE: Record<NoticeTone, { background: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  error: { background: colors.dangerSoft, color: colors.danger, icon: 'alert-circle' },
  info: { background: colors.brandSoft, color: colors.brandInk, icon: 'information-circle' },
  success: { background: colors.successSoft, color: colors.success, icon: 'checkmark-circle' },
  warning: { background: colors.warningSoft, color: colors.warning, icon: 'alert' },
};

export function Notice({ tone = 'info', children }: { tone?: NoticeTone; children: string }) {
  const style = NOTICE[tone];
  return (
    <View
      style={[styles.notice, { backgroundColor: style.background }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={style.icon} size={18} color={style.color} />
      <AppText variant="small" style={{ color: style.color, flex: 1 }}>
        {children}
      </AppText>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={colors.brand} />
      </View>
      <AppText variant="lead" strong>
        {title}
      </AppText>
      <AppText variant="small" tone="muted" style={styles.emptyBody}>
        {body}
      </AppText>
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%' as const }: { height?: number; width?: number | `${number}%` }) {
  return <View style={[styles.skeleton, { height, width }]} accessibilityElementsHidden />;
}

export function StatTile({
  label,
  value,
  tone = 'brand',
  icon,
}: {
  label: string;
  value: number | string;
  tone?: 'brand' | 'warning' | 'success' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const accent =
    tone === 'warning'
      ? colors.warning
      : tone === 'success'
        ? colors.success
        : tone === 'danger'
          ? colors.danger
          : colors.brand;

  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <AppText variant="micro" tone="muted" style={styles.statLabel}>
          {label}
        </AppText>
        {icon ? <Ionicons name={icon} size={16} color={accent} /> : null}
      </View>
      <AppText variant="heading" tabular style={{ color: accent }}>
        {value}
      </AppText>
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyValue}>
      <AppText variant="small" tone="muted">
        {label}
      </AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...(shadow.card as object),
  },
  cardPadded: {
    padding: space.xl,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    flexWrap: 'wrap',
  },
  sectionText: {
    gap: space.xxs,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingVertical: 3,
    paddingHorizontal: space.sm + 2,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.control,
  },
  empty: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xxxl,
    paddingHorizontal: space.xl,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  emptyBody: {
    textAlign: 'center',
    maxWidth: 320,
  },
  skeleton: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.control,
  },
  stat: {
    flex: 1,
    minWidth: 130,
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space.lg,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statLabel: {
    flexShrink: 1,
  },
  keyValue: {
    gap: 2,
  },
});
