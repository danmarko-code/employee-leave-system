import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { HolidayDto } from '@leave/shared';
import { useRouter } from 'expo-router';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, EmptyState, Notice, Skeleton } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function AdminHolidaysScreen() {
  return (
    <RequireRole role="admin">
      <HolidaysList />
    </RequireRole>
  );
}

function HolidaysList() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<HolidayDto[] | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setHolidays(null);
    try {
      const result = await apiFetch<{ items: HolidayDto[] }>('/admin/holidays');
      setHolidays(result.items);
    } catch (loadError: unknown) {
      setError(sessionErrorMessage(loadError));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, attempt]);

  const handleCreate = async () => {
    if (submitting) return;
    const trimmedName = name.trim();
    const trimmedDate = date.trim();
    if (!trimmedName) {
      setError('Enter a holiday name.');
      return;
    }
    if (!trimmedDate || !/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
      setError('Enter a valid date in YYYY-MM-DD format.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch('/admin/holidays', {
        method: 'POST',
        body: { name: trimmedName, date: trimmedDate },
      });
      setName('');
      setDate('');
      setAttempt((n) => n + 1);
    } catch (createError) {
      setError(sessionErrorMessage(createError));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this holiday? It will no longer be excluded from working-day counts.')) return;
    try {
      await apiFetch(`/admin/holidays/${id}`, { method: 'DELETE' });
      setAttempt((n) => n + 1);
    } catch (deleteError) {
      setError(sessionErrorMessage(deleteError));
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Holidays"
        subtitle="Public holidays excluded from working-day counts. Add or remove below."
      />

      <Card style={styles.formCard}>
        <View style={styles.formRow}>
          <View style={styles.nameField}>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. New Year's Day"
              editable={!submitting}
              maxLength={100}
            />
          </View>
          <View style={styles.dateField}>
            <TextField
              label="Date"
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              editable={!submitting}
              maxLength={10}
            />
          </View>
          <View style={styles.submitAction}>
            <Button
              label="Add holiday"
              icon="add"
              loading={submitting}
              onPress={() => void handleCreate()}
              accessibilityHint="Adds a new public holiday"
            />
          </View>
        </View>
        {error ? <Notice tone="error">{error}</Notice> : null}
      </Card>

      {holidays === null && !error ? (
        <Card>
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((key) => (
              <View key={key} style={styles.skeletonRow}>
                <Skeleton height={16} width="40%" />
                <Skeleton height={12} width="30%" />
              </View>
            ))}
          </View>
        </Card>
      ) : holidays ? (
        <Card padded={false}>
          {holidays.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No holidays defined"
              body="Add your first public holiday above."
            />
          ) : (
            holidays.map((holiday, index) => (
              <View key={holiday.id} style={[styles.row, !index && styles.rowFirst]}>
                <View style={styles.rowText}>
                  <AppText variant="body" style={{ fontFamily: fonts.medium }} numberOfLines={1}>
                    {holiday.name}
                  </AppText>
                  <AppText variant="small" tone="muted">
                    {formatDate(holiday.date, { weekday: true })}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => handleDelete(holiday.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${holiday.name}`}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                >
                  <AppText variant="micro" tone="danger" style={{ fontFamily: fonts.medium }}>
                    Delete
                  </AppText>
                </Pressable>
              </View>
            ))
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: space.md,
    maxWidth: 1100,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    alignItems: 'flex-end',
  },
  nameField: {
    flex: 1,
    minWidth: 220,
    maxWidth: 420,
  },
  dateField: {
    width: 160,
  },
  submitAction: {
    justifyContent: 'flex-end',
  },
  skeletonList: {
    gap: space.xl,
    padding: space.xl,
  },
  skeletonRow: {
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowText: {
    gap: 2,
    flexShrink: 1,
  },
  deleteBtn: {
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    backgroundColor: colors.surfaceMuted,
  },
  deleteBtnPressed: {
    backgroundColor: colors.dangerSoft,
  },
});