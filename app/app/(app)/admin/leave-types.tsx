import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { LeaveTypeDto } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, EmptyState, Notice, Skeleton } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { apiFetch } from '@/lib/api';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function AdminLeaveTypesScreen() {
  return (
    <RequireRole role="admin">
      <LeaveTypesList />
    </RequireRole>
  );
}

function LeaveTypesList() {
  const router = useRouter();
  const [types, setTypes] = useState<LeaveTypeDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTypes(null);

    apiFetch<{ items: LeaveTypeDto[] }>('/admin/leave-types')
      .then((result) => {
        if (!cancelled) setTypes(result.items);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(sessionErrorMessage(loadError));
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <Screen>
      <PageHeader
        title="Leave types"
        subtitle="Entitlements and whether a document is required. Deactivate instead of deleting — history is kept."
        action={<Button label="Add leave type" icon="add" onPress={() => router.push('/admin/leave-types/new')} />}
      />

      {error ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{error}</Notice>
          <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)} />
        </Card>
      ) : null}

      <Card padded={false}>
        {types === null && !error ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((key) => (
              <View key={key} style={styles.skeletonRow}>
                <Skeleton height={16} width="40%" />
                <Skeleton height={12} width="62%" />
              </View>
            ))}
          </View>
        ) : types && types.length > 0 ? (
          types.map((type, index) => (
            <LeaveTypeRow
              key={type.id}
              type={type}
              first={index === 0}
              onOpen={() => router.push(`/admin/leave-types/${type.id}`)}
            />
          ))
        ) : types ? (
          <EmptyState
            icon="layers-outline"
            title="No leave types yet"
            body="Create the first leave type so employees can apply for it."
            action={{ label: 'Add leave type', onPress: () => router.push('/admin/leave-types/new') }}
          />
        ) : null}
      </Card>

      <AppText variant="small" tone="faint">
        Inactive types disappear from the application form immediately. Applications already filed
        under them are unaffected.
      </AppText>
    </Screen>
  );
}

function LeaveTypeRow({
  type,
  first,
  onOpen,
}: {
  type: LeaveTypeDto;
  first: boolean;
  onOpen: () => void;
}) {
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${type.name}, ${type.yearlyEntitlement} days per year, ${
        type.requiresDocument ? 'document required' : 'no document required'
      }, ${type.isActive ? 'active' : 'inactive'}`}
      accessibilityHint="Opens the leave type to edit it"
      style={({ pressed }) => [styles.row, !first && styles.rowDivided, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons
          name={type.requiresDocument ? 'document-text-outline' : 'calendar-outline'}
          size={20}
          color={type.isActive ? colors.brand : colors.faint}
        />
      </View>
      <View style={styles.rowText}>
        <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
          {type.name}
        </AppText>
        <AppText variant="small" tone="muted">
          {type.yearlyEntitlement} days a year · {type.requiresDocument ? 'Document required' : 'No document required'}
        </AppText>
      </View>
      <View style={[styles.statusPill, type.isActive ? styles.statusOn : styles.statusOff]}>
        <View style={[styles.dot, type.isActive ? styles.dotOn : styles.dotOff]} />
        <AppText
          variant="micro"
          style={{
            color: type.isActive ? colors.success : colors.muted,
            fontFamily: fonts.medium,
          }}
        >
          {type.isActive ? 'Active' : 'Inactive'}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
  statusOn: {
    backgroundColor: colors.successSoft,
  },
  statusOff: {
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
});
