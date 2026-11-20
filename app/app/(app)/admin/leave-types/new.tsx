import { useState } from 'react';
import { useRouter } from 'expo-router';
import { PageHeader, Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Card } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { LeaveTypeForm, type LeaveTypeValues } from '@/components/LeaveTypeForm';
import { apiFetch } from '@/lib/api';
import { sessionErrorMessage } from '@/lib/session';
import { space } from '@/theme/tokens';
import { StyleSheet, View } from 'react-native';

export default function AdminLeaveTypeNewScreen() {
  return (
    <RequireRole role="admin">
      <LeaveTypeCreate />
    </RequireRole>
  );
}

function LeaveTypeCreate() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (values: LeaveTypeValues) => {
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/admin/leave-types', {
        method: 'POST',
        body: values,
      });
      router.replace('/admin/leave-types');
    } catch (submitError) {
      setError(sessionErrorMessage(submitError));
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Add leave type"
        subtitle="Entitlement counts working days (Monday to Friday) per calendar year."
        breadcrumbs={[
          { label: 'Leave types', href: '/admin/leave-types' },
          { label: 'Add leave type' },
        ]}
      />
      <Card style={styles.card}>
        <LeaveTypeForm
          submitLabel="Create leave type"
          onSubmit={submit}
          submitting={submitting}
          error={error}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.md,
    maxWidth: 620,
  },
});
