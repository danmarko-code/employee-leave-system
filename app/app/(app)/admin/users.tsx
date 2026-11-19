import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { AdminUserDto, Page } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Avatar, Card, EmptyState, Notice, Skeleton } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { apiFetch } from '@/lib/api';
import { roleLabel } from '@/lib/format';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 250;

type RoleFilter = 'all' | 'employee' | 'admin';
type StatusFilter = 'all' | 'active' | 'inactive';

const ROLE_FILTERS: Array<{ key: RoleFilter; label: string }> = [
  { key: 'all', label: 'Everyone' },
  { key: 'employee', label: 'Employees' },
  { key: 'admin', label: 'Administrators' },
];

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
];

export default function AdminUsersScreen() {
  return (
    <RequireRole role="admin">
      <UsersList />
    </RequireRole>
  );
}

function UsersList() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<AdminUserDto> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    if (query) query_.set('q', query);
    if (roleFilter !== 'all') query_.set('role', roleFilter);
    if (statusFilter !== 'all') query_.set('isActive', statusFilter === 'active' ? 'true' : 'false');

    apiFetch<Page<AdminUserDto>>(`/admin/users?${query_.toString()}`)
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
  }, [query, roleFilter, statusFilter, page, attempt]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <Screen>
      <PageHeader
        title="Employees"
        subtitle="Create and manage accounts. Deactivated people keep their history but cannot sign in."
        action={<Button label="Add employee" icon="add" onPress={() => router.push('/admin/users/new')} />}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <TextField
            label="Search people"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, email, position or department"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search people by name, email, position or department"
          />
        </View>
      </View>

      <View style={styles.filterRow}>
        {ROLE_FILTERS.map(({ key, label }) => {
          const selected = roleFilter === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setRoleFilter(key);
                setPage(1);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${label.toLowerCase()}`}
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
        <View style={styles.filterSpacer} />
        {STATUS_FILTERS.map(({ key, label }) => {
          const selected = statusFilter === key;
          return (
            <Pressable
              key={key}
              onPress={() => {
                setStatusFilter(key);
                setPage(1);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Show ${label.toLowerCase()} accounts`}
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
            {[0, 1, 2].map((key) => (
              <View key={key} style={styles.skeletonRow}>
                <Skeleton height={16} width="42%" />
                <Skeleton height={12} width="66%" />
              </View>
            ))}
          </View>
        ) : data && data.items.length > 0 ? (
          data.items.map((user, index) => (
            <UserRow
              key={user.id}
              user={user}
              first={index === 0}
              onOpen={() => router.push(`/admin/users/${user.id}`)}
            />
          ))
        ) : data ? (
          <EmptyState
            icon="people-outline"
            title="No one matches"
            body="Try a different search, role or status."
          />
        ) : null}
      </Card>

      {data && data.total > 0 ? (
        <View style={styles.pagination}>
          <AppText variant="small" tone="muted" tabular>
            {data.total} {data.total === 1 ? 'person' : 'people'}
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

function UserRow({
  user,
  first,
  onOpen,
}: {
  user: AdminUserDto;
  first: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${user.name}, ${roleLabel(user.role)}, ${user.isActive ? 'active' : 'inactive'}`}
      accessibilityHint="Opens the account to edit it"
      style={({ pressed }) => [styles.row, !first && styles.rowDivided, pressed && styles.rowPressed]}
    >
      <Avatar name={user.name} size="sm" />
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {user.name}
        </AppText>
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {user.email}
        </AppText>
        <AppText variant="micro" tone="faint" numberOfLines={1}>
          {[user.position, user.department].filter(Boolean).join(' · ') || 'No position on file'}
        </AppText>
      </View>
      <View style={styles.rowMeta}>
        <View style={[styles.tag, user.role === 'admin' && styles.tagAdmin]}>
          <AppText
            variant="micro"
            style={{ color: user.role === 'admin' ? colors.brandInk : colors.muted, fontFamily: fonts.medium }}
          >
            {roleLabel(user.role)}
          </AppText>
        </View>
        <View style={[styles.activePill, user.isActive ? styles.activePillOn : styles.activePillOff]}>
          <View style={[styles.dot, user.isActive ? styles.dotOn : styles.dotOff]} />
          <AppText variant="micro" style={{ color: user.isActive ? colors.success : colors.muted, fontFamily: fonts.medium }}>
            {user.isActive ? 'Active' : 'Inactive'}
          </AppText>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
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
    alignItems: 'center',
  },
  filterSpacer: {
    width: space.md,
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
  tag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
  tagAdmin: {
    backgroundColor: colors.brandSoft,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
  activePillOn: {
    backgroundColor: colors.successSoft,
  },
  activePillOff: {
    backgroundColor: colors.surfaceMuted,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  dotOn: {
    backgroundColor: colors.success,
  },
  dotOff: {
    backgroundColor: colors.faint,
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
