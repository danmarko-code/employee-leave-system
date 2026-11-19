import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { LeaveApplicationDto, LeaveStatus, Page } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, EmptyState, Notice, SectionTitle, Skeleton, StatusPill } from '@/components/Surface';
import { apiFetch } from '@/lib/api';
import { formatDateRange, daysLabel } from '@/lib/format';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Filter = 'all' | LeaveStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const PAGE_SIZE = 10;

export default function RequestsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<LeaveApplicationDto> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filter !== 'all') query.set('status', filter);

    apiFetch<Page<LeaveApplicationDto>>(`/leaves?${query.toString()}`)
      .then((result) => {
        if (cancelled) return;
        // Filtering can empty the last page while a higher one is visible.
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
  }, [filter, page, attempt]);

  const changeFilter = useCallback((next: Filter) => {
    setFilter(next);
    setPage(1);
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  if (!user) return null;

  return (
    <Screen>
      <PageHeader
        title="My requests"
        subtitle="Every application you have filed, newest first."
        action={
          user.role === 'employee' ? (
            <Button label="Apply for leave" icon="add" onPress={() => router.push('/requests/new')} />
          ) : undefined
        }
      />

      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => {
          const selected = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => changeFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${label.toLowerCase()} requests`}
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
          <Notice tone="error">{error}</Notice>
          <Button
            label="Try again"
            variant="secondary"
            size="sm"
            onPress={() => setAttempt((count) => count + 1)}
          />
        </Card>
      ) : null}

      <Card padded={false}>
        {data === null && !error ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2, 3].map((key) => (
              <View key={key} style={styles.skeletonRow}>
                <Skeleton height={16} width="42%" />
                <Skeleton height={12} width="62%" />
              </View>
            ))}
          </View>
        ) : data && data.items.length > 0 ? (
          data.items.map((application, index) => (
            <RequestRow
              key={application.id}
              application={application}
              first={index === 0}
              onOpen={() => router.push(`/requests/${application.id}`)}
            />
          ))
        ) : data ? (
          <EmptyState
            icon="document-text-outline"
            title={filter === 'all' ? 'No requests yet' : `Nothing ${filter} right now`}
            body={
              filter === 'all'
                ? 'When you apply for leave, your application and its status will appear here.'
                : 'Applications with this status will appear here.'
            }
            action={
              filter === 'all' && user.role === 'employee'
                ? { label: 'Apply for leave', onPress: () => router.push('/requests/new') }
                : undefined
            }
          />
        ) : null}
      </Card>

      {data && data.total > 0 ? (
        <View style={styles.pagination}>
          <AppText variant="small" tone="muted" tabular>
            {data.total} {data.total === 1 ? 'application' : 'applications'}
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

function RequestRow({
  application,
  first,
  onOpen,
}: {
  application: LeaveApplicationDto;
  first: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${application.leaveTypeName}, ${formatDateRange(
        application.startDate,
        application.endDate
      )}, ${application.status}`}
      accessibilityHint="Opens the request details"
      style={({ pressed }) => [styles.row, !first && styles.rowDivided, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={
            application.status === 'approved'
              ? 'checkmark-circle-outline'
              : application.status === 'rejected'
                ? 'close-circle-outline'
                : 'time-outline'
          }
          size={22}
          color={colors.faint}
        />
      </View>
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {application.leaveTypeName}
        </AppText>
        <AppText variant="small" tone="muted">
          {formatDateRange(application.startDate, application.endDate)} ·{' '}
          {daysLabel(application.workingDays)}
        </AppText>
      </View>
      <View style={styles.rowMeta}>
        <StatusPill status={application.status} />
        <AppText variant="micro" tone="faint">
          Filed {formatFiledOn(application.createdAt)}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function formatFiledOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
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
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: space.xs,
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
