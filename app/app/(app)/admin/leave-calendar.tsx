import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LeaveApplicationDto } from '@leave/shared';
import { useRouter } from 'expo-router';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Avatar, Card, EmptyState, StatusPill } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { apiFetch } from '@/lib/api';
import { formatDateRange, formatDate } from '@/lib/format';
import { usePhoto } from '@/lib/photo';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 100;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function LeaveCalendarScreen() {
  return (
    <RequireRole role="admin">
      <LeaveCalendarContent />
    </RequireRole>
  );
}

function LeaveCalendarContent() {
  const router = useRouter();
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [data, setData] = useState<{ items: LeaveApplicationDto[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    const query = new URLSearchParams({ status: 'approved', page: '1', pageSize: String(PAGE_SIZE) });
    if (deptFilter !== 'all') query.set('department', deptFilter);

    apiFetch<{ items: LeaveApplicationDto[]; total: number }>(`/admin/leaves?${query.toString()}`)
      .then((result) => {
        if (cancelled) return;
        setData(result);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(sessionErrorMessage(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [deptFilter, attempt]);

  const departments = ['all', ...new Set((data?.items ?? []).map((item) => item.department).filter(Boolean))];

  return (
    <Screen>
      <PageHeader title="Leave calendar" subtitle="Approved leave across the team, by department." />

      <View style={styles.filterRow}>
        {departments.map((dept) => {
          const selected = deptFilter === dept;
          const label = dept === 'all' ? 'All departments' : dept;
          return (
            <Pressable
              key={dept}
              onPress={() => setDeptFilter(dept)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${label} approved leave`}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && !selected && styles.chipPressed,
              ]}
            >
              <AppText
                variant="small"
                style={{ color: selected ? colors.brandInk : colors.muted, fontFamily: fonts.medium }}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <Card style={styles.errorCard}>
          <AppText tone="danger">{error}</AppText>
          <Pressable
            onPress={() => setAttempt((n) => n + 1)}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
          >
            <AppText variant="small" tone="brand">Try again</AppText>
          </Pressable>
        </Card>
      ) : null}

      {data === null && !error ? (
        <Card>
          <ScrollView contentContainerStyle={styles.list}>
            {[0, 1, 2, 3, 4].map((key) => (
              <View key={key} style={styles.skeletonRow}>
                <AppText variant="body">Loading…</AppText>
              </View>
            ))}
          </ScrollView>
        </Card>
      ) : null}

      {data ? (
        <Card padded={false} style={styles.listCard}>
          {data.items.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No approved leave"
              body={deptFilter !== 'all' ? `No approved leave in ${deptFilter}.` : 'Nothing approved yet.'}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              {data.items.map((item) => {
                const employeeId = item.userId;
                const photo = employeeId ? usePhoto(employeeId, 'thumb') : null;
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <Avatar name={item.employeeName} photo={photo} size="sm" />
                    <View style={styles.itemText}>
                      <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
                        {item.employeeName}
                      </AppText>
                      <AppText variant="small" tone="muted" numberOfLines={1}>
                        {[item.department, item.leaveTypeName].filter(Boolean).join(' · ') || '—'}
                      </AppText>
                    </View>
                    <View style={styles.itemDates}>
                      <AppText variant="small" tone="muted" numberOfLines={1}>
                        {formatDateRange(item.startDate, item.endDate)}
                      </AppText>
                      <AppText variant="micro" tone="faint">
                        {formatDate(item.startDate)} → {formatDate(item.endDate)}
                      </AppText>
                    </View>
                    <StatusPill status={item.status} />
                  </View>
                );
              })}
            </ScrollView>
          )}
        </Card>
      ) : null}

      {data && data.items.length > 0 ? (
        <View style={styles.countRow}>
          <Ionicons name="people-outline" size={16} color={colors.faint} />
          <AppText variant="small" tone="muted" tabular>
            {data.total} approved {data.total === 1 ? 'record' : 'records'} shown
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.md,
  },
  chip: {
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
  },
  retry: {
    paddingVertical: 8,
    paddingHorizontal: space.lg,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
  },
  retryPressed: {
    backgroundColor: colors.border,
  },
  listCard: {
    padding: 0,
  },
  list: {
    padding: space.md,
  },
  skeletonRow: {
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  itemDates: {
    alignItems: 'flex-end',
    gap: 2,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
