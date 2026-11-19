import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { LeaveTypeDto } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, Notice, SectionTitle, Skeleton } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { LeaveTypeForm, type LeaveTypeValues } from '@/components/LeaveTypeForm';
import { apiFetch } from '@/lib/api';
import { sessionErrorMessage } from '@/lib/session';
import { space } from '@/theme/tokens';

export default function AdminLeaveTypeEditScreen() {
  return (
    <RequireRole role="admin">
      <LeaveTypeEditor />
    </RequireRole>
  );
}

function LeaveTypeEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const [type, setType] = useState<LeaveTypeDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setType(null);
    setLoadError(null);
    if (!Number.isInteger(id) || id <= 0) {
      setLoadError('That leave type does not exist.');
      return;
    }
    let cancelled = false;
    apiFetch<{ items: LeaveTypeDto[] }>('/admin/leave-types')
      .then((result) => {
        if (cancelled) return;
        const match = result.items.find((item) => item.id === id);
        if (match) setType(match);
        else setLoadError('That leave type does not exist.');
      })
      .catch((loadFailure: unknown) => {
        if (!cancelled) setLoadError(sessionErrorMessage(loadFailure));
      });
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const submit = async (values: LeaveTypeValues) => {
    if (!type) return;
    setSubmitting(true);
    setError(null);
    setSavedAt(null);
    try {
      const { leaveType } = await apiFetch<{ leaveType: LeaveTypeDto }>(`/admin/leave-types/${type.id}`, {
        method: 'PATCH',
        body: values,
      });
      setType(leaveType);
      setSavedAt(new Date().toISOString());
    } catch (submitError) {
      setError(sessionErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title={type ? type.name : 'Leave type'}
        subtitle="Entitlements apply from the next year's balance calculation; filed applications keep their own numbers."
        action={<Button label="Back" variant="ghost" size="sm" icon="chevron-back" onPress={() => router.back()} />}
      />

      {loadError ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{loadError}</Notice>
          <View style={styles.errorActions}>
            <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((n) => n + 1)} />
            <Button label="Leave types" variant="ghost" size="sm" onPress={() => router.replace('/admin/leave-types')} />
          </View>
        </Card>
      ) : null}

      {type === null && !loadError ? (
        <Card style={styles.card}>
          <Skeleton height={16} width="35%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </Card>
      ) : type ? (
        <Card style={styles.card}>
          <SectionTitle
            title="Details"
            detail="There is no delete — deactivate instead so filed applications keep their type."
          />
          <LeaveTypeForm
            initial={type}
            submitLabel="Save changes"
            onSubmit={submit}
            submitting={submitting}
            error={error}
            successMessage={savedAt ? 'Saved.' : null}
          />
        </Card>
      ) : null}

      <AppText variant="small" tone="faint">
        Changes are recorded in the activity log as leave-type changes.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    maxWidth: 620,
  },
  errorCard: {
    gap: space.md,
    alignItems: 'flex-start',
    maxWidth: 620,
  },
  errorActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
});
