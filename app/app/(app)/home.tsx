import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type {
  DashboardStats,
  LeaveApplicationDto,
  LeaveBalanceDto,
  Page,
} from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import {
  Card,
  EmptyState,
  Notice,
  SectionTitle,
  Skeleton,
  StatTile,
  StatusPill,
} from '@/components/Surface';
import { apiFetch } from '@/lib/api';
import { currentYear, daysLabel, firstName, formatDateRange, greeting, longToday, roleLabel } from '@/lib/format';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function HomeScreen() {
  const { user } = useSession();
  if (!user) return null;
  return user.role === 'admin' ? <AdminHome /> : <EmployeeHome />;
}

function EmployeeHome() {
  const { user } = useSession();
  const router = useRouter();
  const [balances, setBalances] = useState<LeaveBalanceDto[] | null>(null);
  const [recent, setRecent] = useState<LeaveApplicationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    const load = async () => {
      try {
        const [balancesResult, leavesResult] = await Promise.all([
          apiFetch<{ items: LeaveBalanceDto[] }>(`/leave-balances?year=${currentYear()}`),
          apiFetch<Page<LeaveApplicationDto>>('/leaves?pageSize=3'),
        ]);
        if (cancelled) return;
        setBalances(balancesResult.items);
        setRecent(leavesResult.items);
      } catch (loadError) {
        if (!cancelled) setError(sessionErrorMessage(loadError));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!user) return null;

  return (
    <Screen>
      <PageHeader
        title={`${greeting()}, ${firstName(user.name)}`}
        subtitle={`${longToday()}${user.department ? ` · ${user.department}` : ''}`}
        action={
          <Button label="Apply for leave" size="sm" icon="add" onPress={() => router.push('/requests/new')} />
        }
      />

      {error ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{error}</Notice>
          <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)} />
        </Card>
      ) : null}

      <View style={styles.section}>
        <SectionTitle
          title="Leave balance"
          detail={`${currentYear()} · pending requests are already set aside`}
        />

        {balances === null && !error ? (
          <View style={styles.grid}>
            {[0, 1, 2].map((key) => (
              <View key={key} style={styles.balanceCard}>
                <Skeleton height={14} width="50%" />
                <Skeleton height={40} width="35%" />
                <Skeleton height={12} width="70%" />
              </View>
            ))}
          </View>
        ) : balances && balances.length > 0 ? (
          <View style={styles.grid}>
            {balances.map((balance) => (
              <BalanceCard key={balance.id} balance={balance} />
            ))}
          </View>
        ) : balances ? (
          <Card>
            <EmptyState
              icon="calendar-outline"
              title="No leave types are active"
              body="Your administrator manages the list of leave types and yearly entitlements."
            />
          </Card>
        ) : null}
      </View>

      <View style={styles.section}>
        <SectionTitle title="Recent requests" detail="Your three latest applications" />
        <Card padded={false}>
          {recent === null && !error ? (
            <View style={styles.skeletonList}>
              <Skeleton height={16} width="55%" />
              <Skeleton height={16} width="40%" />
              <Skeleton height={16} width="48%" />
            </View>
          ) : recent && recent.length > 0 ? (
            recent.map((application, index) => (
              <RequestRow
                key={application.id}
                application={application}
                first={index === 0}
                onOpen={() => router.push(`/requests/${application.id}`)}
              />
            ))
          ) : recent ? (
            <EmptyState
              icon="document-text-outline"
              title="No requests yet"
              body="Applications you submit will appear here with their current status."
              action={{ label: 'Apply for leave', onPress: () => router.push('/requests/new') }}
            />
          ) : null}
        </Card>
        {recent && recent.length > 0 ? (
          <View style={styles.viewAll}>
            <Button label="View all requests" variant="ghost" size="sm" onPress={() => router.push('/requests')} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function AdminHome() {
  const { user } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pending, setPending] = useState<LeaveApplicationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    const load = async () => {
      try {
        const [statsResult, pendingResult] = await Promise.all([
          apiFetch<DashboardStats>('/admin/dashboard'),
          apiFetch<Page<LeaveApplicationDto>>('/admin/leaves?status=pending&pageSize=4'),
        ]);
        if (cancelled) return;
        setStats(statsResult);
        setPending(pendingResult.items);
      } catch (loadError) {
        if (!cancelled) setError(sessionErrorMessage(loadError));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!user) return null;

  return (
    <Screen>
      <PageHeader
        title={`${greeting()}, ${firstName(user.name)}`}
        subtitle={`${longToday()} · ${roleLabel(user.role)}`}
      />

      {error ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{error}</Notice>
          <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)} />
        </Card>
      ) : null}

      <View style={styles.statsRow}>
        <StatTile label="Waiting" value={stats?.pending ?? '–'} tone="warning" icon="time-outline" />
        <StatTile label="Approved" value={stats?.approved ?? '–'} tone="success" icon="checkmark-circle-outline" />
        <StatTile label="Rejected" value={stats?.rejected ?? '–'} tone="danger" icon="close-circle-outline" />
        <StatTile label="Active people" value={stats?.activeEmployees ?? '–'} tone="brand" icon="people-outline" />
        <StatTile label="Leave types" value={stats?.activeLeaveTypes ?? '–'} tone="brand" icon="albums-outline" />
      </View>

      <View style={styles.section}>
        <SectionTitle title="Waiting for a decision" detail="The latest pending requests" />
        <Card padded={false}>
          {pending === null && !error ? (
            <View style={styles.skeletonList}>
              <Skeleton height={16} width="60%" />
              <Skeleton height={16} width="45%" />
              <Skeleton height={16} width="52%" />
            </View>
          ) : pending && pending.length > 0 ? (
            pending.map((application, index) => (
              <AdminRequestRow
                key={application.id}
                application={application}
                first={index === 0}
                onOpen={() => router.push(`/requests/${application.id}`)}
              />
            ))
          ) : pending ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Nothing is waiting"
              body="New employee applications will appear here for review."
            />
          ) : null}
        </Card>
        {pending && pending.length > 0 ? (
          <View style={styles.viewAll}>
            <Button
              label="View all applications"
              variant="ghost"
              size="sm"
              onPress={() => router.push('/approvals')}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function BalanceCard({ balance }: { balance: LeaveBalanceDto }) {
  return (
    <View style={styles.balanceCard}>
      <AppText variant="label" tone="muted" numberOfLines={1}>
        {balance.name}
      </AppText>
      <View style={styles.balanceFigure}>
        <AppText variant="display" tabular>
          {balance.remainingDays}
        </AppText>
        <AppText variant="small" tone="muted" style={styles.daysLeft}>
          {balance.remainingDays === 1 ? 'day left' : 'days left'}
        </AppText>
      </View>
      <AppText variant="micro" tone="faint" tabular>
        {balance.approvedDays} approved · {balance.pendingDays} pending · {balance.yearlyEntitlement} per year
      </AppText>
      {balance.requiresDocument ? (
        <View style={styles.docHint}>
          <Ionicons name="document-text-outline" size={13} color={colors.faint} />
          <AppText variant="micro" tone="faint">
            Document required
          </AppText>
        </View>
      ) : null}
    </View>
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
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {application.leaveTypeName}
        </AppText>
        <AppText variant="small" tone="muted">
          {formatDateRange(application.startDate, application.endDate)} · {daysLabel(application.workingDays)}
        </AppText>
      </View>
      <StatusPill status={application.status} />
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

function AdminRequestRow({
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
      )}, pending`}
      accessibilityHint="Opens the application to review it"
      style={({ pressed }) => [styles.row, !first && styles.rowDivided, pressed && styles.rowPressed]}
    >
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {application.employeeName}
        </AppText>
        <AppText variant="small" tone="muted" numberOfLines={1}>
          {application.leaveTypeName} · {formatDateRange(application.startDate, application.endDate)} ·{' '}
          {daysLabel(application.workingDays)}
        </AppText>
      </View>
      <AppText variant="micro" tone="faint" tabular>
        {application.department}
      </AppText>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  balanceCard: {
    flexGrow: 1,
    flexBasis: 210,
    maxWidth: 360,
    gap: space.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space.xl,
  },
  balanceFigure: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
  },
  daysLeft: {
    paddingBottom: 4,
  },
  docHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginTop: space.xxs,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  viewAll: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  skeletonList: {
    gap: space.lg,
    padding: space.xl,
  },
  errorCard: {
    gap: space.md,
    alignItems: 'flex-start',
  },
});
