import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { LeaveApplicationDto, LeaveStatus, LeaveTypeDto, Page } from '@leave/shared';
import { useRouter } from 'expo-router';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Avatar, EmptyState, Notice, Skeleton } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { Table, type TableColumn } from '@/components/Table';
import { apiFetch } from '@/lib/api';
import { daysLabel, formatDateRange, formatDateTime } from '@/lib/format';
import { usePhoto } from '@/lib/photo';
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

  const columns: TableColumn<LeaveApplicationDto>[] = [
    {
      key: 'photo',
      header: 'Photo',
      render: (row) => <QueueAvatar userId={row.userId} name={row.employeeName} />,
    },
    {
      key: 'name',
      header: 'Employee',
      render: (row) => (
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {row.employeeName}
        </AppText>
      ),
    },
    {
      key: 'department',
      header: 'Department',
      render: (row) => (
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {row.department || '—'}
        </AppText>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {row.leaveTypeName}
        </AppText>
      ),
    },
    {
      key: 'dates',
      header: 'Dates',
      render: (row) => (
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {formatDateRange(row.startDate, row.endDate)}
        </AppText>
      ),
    },
    {
      key: 'days',
      header: 'Days',
      render: (row) => (
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {daysLabel(row.workingDays)}
        </AppText>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <QueueStatus status={row.status} />,
    },
    {
      key: 'filedOn',
      header: 'Filed on',
      render: (row) => (
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {formatDateTime(row.createdAt)}
        </AppText>
      ),
    },
  ];

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

      <Table
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(row) => row.id}
        onRowPress={(row) => router.push(`/requests/${row.id}`)}
        loading={data === null && !error}
        error={error}
        onRetry={() => setAttempt((count) => count + 1)}
        emptyTitle={filter === 'pending' && !query && typeFilter === 'all' ? 'Nothing is waiting' : 'Nothing matches these filters'}
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total}
        onPageChange={setPage}
        rowLabel={(row) => `${row.employeeName}, ${row.leaveTypeName}, ${formatDateRange(row.startDate, row.endDate)}, ${row.status}`}
      />
    </Screen>
  );
}

function QueueAvatar({ userId, name }: { userId: number; name: string }) {
  const photo = usePhoto(userId, 'thumb');
  return <Avatar name={name} photo={photo} size="sm" />;
}

function QueueStatus({ status }: { status: LeaveStatus }) {
  const map = {
    pending: { bg: colors.warningSoft, color: colors.warning, label: 'Pending' },
    approved: { bg: colors.successSoft, color: colors.success, label: 'Approved' },
    rejected: { bg: colors.dangerSoft, color: colors.danger, label: 'Rejected' },
  };
  const s = map[status];
  return (
    <Pressable style={[styles.statusPill, { backgroundColor: s.bg }]} accessibilityRole="text" accessibilityLabel={s.label}>
      <AppText variant="micro" style={{ color: s.color, fontFamily: fonts.medium }}>
        {s.label}
      </AppText>
    </Pressable>
  );
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
  statusPill: {
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
});