import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ACTIVITY_ACTIONS, type ActivityAction, type ActivityLogItem, type ActivityLogPage } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, EmptyState, Notice, Skeleton } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { apiFetch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 10;

/** Friendly labels for the audit actions. Keys come straight from the contract. */
const ACTION_LABELS: Record<ActivityAction, string> = {
  login_success: 'Login success',
  login_failure: 'Login failure',
  logout: 'Logout',
  session_reuse: 'Session reuse',
  access_denied: 'Access denied',
  profile_update: 'Profile update',
  account_created: 'Account created',
  account_updated: 'Account updated',
  account_activation_changed: 'Activation changed',
  password_reset: 'Password reset',
  leave_submitted: 'Leave submitted',
  leave_approved: 'Leave approved',
  leave_rejected: 'Leave rejected',
  leave_type_changed: 'Leave type changed',
  report_generated: 'Report generated',
};

const ALERT_ACTIONS = new Set<ActivityAction>(['login_failure', 'session_reuse', 'access_denied']);

export default function AdminActivityScreen() {
  return (
    <RequireRole role="admin">
      <ActivityLog />
    </RequireRole>
  );
}

function ActivityLog() {
  const [action, setAction] = useState<ActivityAction | 'all'>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivityLogPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (action !== 'all') query.set('action', action);

    apiFetch<ActivityLogPage>(`/admin/activity-logs?${query.toString()}`)
      .then((result) => {
        if (cancelled) return;
        if (result.items.length === 0 && result.total > 0 && page > 1) {
          setPage((current) => Math.max(1, current - 1));
          return;
        }
        setData(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(sessionErrorMessage(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [action, page, attempt]);

  const changeAction = useCallback((next: ActivityAction | 'all') => {
    setAction(next);
    setPage(1);
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Screen>
      <PageHeader
        title="Activity"
        subtitle="A read-only trail of sign-ins and administrator actions. Entries cannot be edited or deleted."
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <ActionChip label="All" selected={action === 'all'} onPress={() => changeAction('all')} />
        {ACTIVITY_ACTIONS.map((key) => (
          <ActionChip
            key={key}
            label={ACTION_LABELS[key]}
            selected={action === key}
            alert={ALERT_ACTIONS.has(key)}
            onPress={() => changeAction(key)}
          />
        ))}
      </ScrollView>

      {error ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{error}</Notice>
          <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)} />
        </Card>
      ) : null}

      <Card padded={false}>
        {data === null && !error ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2, 3].map((key) => (
              <View key={key} style={styles.skeletonRow}>
                <Skeleton height={14} width="40%" />
                <Skeleton height={12} width="62%" />
              </View>
            ))}
          </View>
        ) : data && data.items.length > 0 ? (
          data.items.map((entry, index) => <ActivityRow key={entry.id} entry={entry} first={index === 0} />)
        ) : data ? (
          <EmptyState
            icon="pulse-outline"
            title="Nothing recorded"
            body="No activity of that kind yet. Sign-ins, denials and admin actions land here."
          />
        ) : null}
      </Card>

      {data && data.total > 0 ? (
        <View style={styles.pagination}>
          <AppText variant="small" tone="muted" tabular>
            {data.total} {data.total === 1 ? 'entry' : 'entries'}
            {' · '}page {data.page} of {totalPages}
          </AppText>
          <View style={styles.paginationButtons}>
            <Button
              label="Previous"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onPress={() => setPage((current) => Math.max(1, current - 1))}
            />
            <Button
              label="Next"
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onPress={() => setPage((current) => Math.min(totalPages, current + 1))}
            />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function ActionChip({
  label,
  selected,
  alert = false,
  onPress,
}: {
  label: string;
  selected: boolean;
  alert?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Filter by ${label}`}
      style={({ pressed }) => [
        styles.chip,
        alert && styles.chipAlert,
        selected && styles.chipSelected,
        pressed && !selected && styles.chipPressed,
      ]}
    >
      <AppText
        variant="small"
        style={{
          color: selected ? colors.brandInk : alert ? colors.danger : colors.muted,
          fontFamily: fonts.medium,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function ActivityRow({ entry, first }: { entry: ActivityLogItem; first: boolean }) {
  const alert = ALERT_ACTIONS.has(entry.action as ActivityAction);
  const target =
    entry.targetType && entry.targetId !== null
      ? `${entry.targetType} #${entry.targetId}`
      : null;

  return (
    <View style={[styles.row, !first && styles.rowDivided]}>
      <View style={[styles.rowIcon, alert && styles.rowIconAlert]}>
        <Ionicons
          name={alert ? 'alert-circle-outline' : 'shield-checkmark-outline'}
          size={20}
          color={alert ? colors.danger : colors.brand}
        />
      </View>
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {ACTION_LABELS[entry.action as ActivityAction] ?? entry.action}
        </AppText>
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {entry.actorName ?? 'System'}
          {target ? ` → ${target}` : ''}
          {entry.ipAddress ? ` · ${entry.ipAddress}` : ''}
        </AppText>
      </View>
      <AppText variant="micro" tone="faint" tabular>
        {formatDateTime(entry.createdAt)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    gap: space.sm,
    paddingVertical: space.xxs,
  },
  chip: {
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipAlert: {
    borderColor: colors.dangerSoft,
  },
  chipSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  chipPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  errorCard: {
    gap: space.md,
    alignItems: 'flex-start',
    maxWidth: 720,
  },
  skeletonList: {
    gap: space.xxl,
    padding: space.xl,
  },
  skeletonRow: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconAlert: {
    backgroundColor: colors.dangerSoft,
  },
  rowText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.md,
  },
  paginationButtons: {
    flexDirection: 'row',
    gap: space.sm,
  },
});
