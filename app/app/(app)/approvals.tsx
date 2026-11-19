import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { LeaveApplicationDto, LeaveStatus, LeaveTypeDto, Page } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Avatar, Card, EmptyState, Notice, Skeleton, StatusPill } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { apiFetch } from '@/lib/api';
import { daysLabel, formatDateRange } from '@/lib/format';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

type Filter = 'all' | LeaveStatus;

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 250;

export default function ApprovalsScreen() {
  return (
    <RequireRole role="admin">
      <ApprovalsQueue />
    </RequireRole>
  );
}

function ApprovalsQueue() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  const [types, setTypes] = useState<LeaveTypeDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<LeaveApplicationDto> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Leave types for the type filter; includes inactive ones so old
  // applications filed under them can still be reviewed.
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ items: LeaveTypeDto[] }>('/admin/leave-types')
      .then((result) => {
        if (!cancelled) setTypes(result.items);
      })
      .catch(() => {
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);

    const query_ = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (filter !== 'all') query_.set('status', filter);
    if (query) query_.set('q', query);
    if (typeFilter !== 'all') query_.set('leaveTypeId', String(typeFilter));

    apiFetch<Page<LeaveApplicationDto>>(`/admin/leaves?${query_.toString()}`)
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
  }, [filter, typeFilter, query, page, attempt]);

  const changeFilter = useCallback((next: Filter) => {
    setFilter(next);
    setPage(1);
  }, []);

  const changeTypeFilter = useCallback((next: number | 'all') => {
    setTypeFilter(next);
    setPage(1);
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Screen>
      <PageHeader
        title="Applications"
        subtitle="Open an application to review it, then approve or reject it."
      />

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search people"
            value={search}
            onChangeText={setSearch}
            placeholder="Name or email"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search people by name or email"
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => {
          const selected = filter === key;
          return (
            <Pressable
              key={key}
              onPress={() => changeFilter(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${label.toLowerCase()} applications`}
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

      {types && types.length > 0 ? (
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => changeTypeFilter('all')}
            accessibilityRole="button"
            accessibilityState={{ selected: typeFilter === 'all' }}
            accessibilityLabel="Show every leave type"
            style={({ pressed }) => [
              styles.chip,
              typeFilter === 'all' && styles.chipSelected,
              pressed && typeFilter !== 'all' && styles.chipPressed,
            ]}
          >
            <AppText
              variant="small"
              style={{ color: typeFilter === 'all' ? colors.brandInk : colors.muted, fontFamily: fonts.medium }}
            >
              All types
            </AppText>
          </Pressable>
          {types.map((type) => {
            const selected = typeFilter === type.id;
            return (
              <Pressable
                key={type.id}
                onPress={() => changeTypeFilter(type.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${type.name} applications`}
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
                  {type.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}

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
                <Skeleton height={12} width="66%" />
              </View>
            ))}
          </View>
        ) : data && data.items.length > 0 ? (
          data.items.map((application, index) => (
            <QueueRow
              key={application.id}
              application={application}
              first={index === 0}
              onOpen={() => router.push(`/requests/${application.id}`)}
            />
          ))
        ) : data ? (
          <EmptyState
            icon="file-tray-full-outline"
            title={filter === 'pending' ? 'Nothing is waiting' : 'Nothing matches these filters'}
            body={
              filter === 'pending' && !query && typeFilter === 'all'
                ? 'New employee applications will appear here for your review.'
                : 'Try a different status, leave type or search.'
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

function QueueRow({
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
      accessibilityLabel={`${application.employeeName}, ${application.leaveTypeName}, ${formatDateRange(
        application.startDate,
        application.endDate
      )}, ${application.status}`}
      accessibilityHint="Opens the application to review it"
      style={({ pressed }) => [styles.row, !first && styles.rowDivided, pressed && styles.rowPressed]}
    >
      <Avatar name={application.employeeName} size="sm" />
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {application.employeeName}
        </AppText>
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {application.leaveTypeName} · {formatDateRange(application.startDate, application.endDate)} ·{' '}
          {daysLabel(application.workingDays)}
        </AppText>
        <AppText variant="micro" tone="faint" numberOfLines={1}>
          {application.department} · filed {formatFiledOn(application.createdAt)}
        </AppText>
      </View>
      <View style={styles.rowMeta}>
        <StatusPill status={application.status} />
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function formatFiledOn(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
  },
  searchField: {
    flex: 1,
    maxWidth: 420,
  },
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
