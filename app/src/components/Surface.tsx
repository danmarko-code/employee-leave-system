import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LeaveStatus } from '@leave/shared';
import { AppText } from './Text';
import { Button } from './Button';
import { Badge, StatusBadge } from './Badge';
import { colors, fonts, radius, space } from '@/theme/tokens';

export { Avatar } from './Avatar';
export { EmptyState } from './EmptyState';
export { StatusBadge, Badge } from './Badge';

/** Flat panel: 1px border, 8px radius, no shadow. */
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

/** @deprecated use StatusBadge. Kept so existing screens keep compiling. */
export function StatusPill({ status }: { status: LeaveStatus }) {
  return <StatusBadge status={status} />;
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

export function Skeleton({
  height = 16,
  width = '100%' as const,
}: {
  height?: number;
  width?: number | `${number}%`;
}) {
  return <View style={[styles.skeleton, { height, width }]} accessibilityElementsHidden />;
}

export function StatTile({
  label,
  value,
  tone = 'brand',
  icon,
  onPress,
}: {
  label: string;
  value: number | string;
  tone?: 'brand' | 'warning' | 'success' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
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
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `View ${label.toLowerCase()}` : undefined}
      style={({ pressed }: { pressed: boolean }) => [
        styles.stat,
        pressed && onPress && { backgroundColor: colors.surfaceMuted },
      ]}
    >
      <View style={styles.statTop}>
        <AppText variant="micro" tone="muted" style={styles.statLabel}>
          {label}
        </AppText>
        {icon ? <Ionicons name={icon} size={16} color={colors.faint} /> : null}
      </View>
      <AppText variant="heading" tabular style={{ color: colors.ink }}>
        {value}
      </AppText>
      <View style={[styles.statRule, { backgroundColor: accent }]} />
    </Pressable>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.keyValue}>
      <AppText variant="micro" tone="muted">
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
  },
  cardPadded: {
    padding: space.lg,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
    flexWrap: 'wrap',
  },
  sectionText: {
    gap: 2,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.control,
  },
  skeleton: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.sm,
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
  statRule: {
    height: 2,
    width: 24,
    borderRadius: radius.sm,
    marginTop: space.xs,
  },
  keyValue: {
    gap: 2,
  },
});
