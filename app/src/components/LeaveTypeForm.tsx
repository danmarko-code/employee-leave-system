import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import type { LeaveTypeDto } from '@leave/shared';
import { AppText } from './Text';
import { TextField } from './TextField';
import { Button } from './Button';
import { Notice, SectionTitle } from './Surface';
import { colors, space } from '@/theme/tokens';

export interface LeaveTypeValues {
  name: string;
  yearlyEntitlement: number;
  requiresDocument: boolean;
  isActive: boolean;
}

/**
 * Shared create/edit form for leave types. The server re-validates everything;
 * this only mirrors the cheap checks so the form fails fast.
 */
export function LeaveTypeForm({
  initial,
  submitLabel,
  onSubmit,
  submitting,
  error,
  successMessage,
}: {
  initial?: LeaveTypeDto;
  submitLabel: string;
  onSubmit: (values: LeaveTypeValues) => Promise<void>;
  submitting: boolean;
  error: string | null;
  successMessage?: string | null;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [entitlement, setEntitlement] = useState(initial ? String(initial.yearlyEntitlement) : '');
  const [requiresDocument, setRequiresDocument] = useState(initial?.requiresDocument ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [entitlementError, setEntitlementError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const parseEntitlement = (): number | null => {
    const trimmed = entitlement.trim();
    if (trimmed === '') {
      setEntitlementError('Enter the yearly entitlement.');
      return null;
    }
    if (!/^\d{1,3}$/.test(trimmed)) {
      setEntitlementError('Use a whole number of days.');
      return null;
    }
    const value = Number(trimmed);
    if (value < 0 || value > 365) {
      setEntitlementError('Between 0 and 365 days.');
      return null;
    }
    setEntitlementError(null);
    return value;
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setNameError('Enter a leave type name.');
      return;
    }
    setNameError(null);
    const days = parseEntitlement();
    if (days === null) return;
    await onSubmit({
      name: trimmedName,
      yearlyEntitlement: days,
      requiresDocument,
      isActive,
    });
  };

  return (
    <View style={styles.root}>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

      <TextField
        label="Leave type name"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setNameError(null);
        }}
        placeholder="e.g. Vacation leave"
        error={nameError}
        editable={!submitting}
        maxLength={100}
      />

      <TextField
        label="Yearly entitlement (working days)"
        value={entitlement}
        onChangeText={(value) => {
          setEntitlement(value);
          setEntitlementError(null);
        }}
        placeholder="e.g. 15"
        keyboardType="number-pad"
        error={entitlementError}
        editable={!submitting}
        maxLength={3}
      />

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <AppText variant="label" tone="muted">
            Document required
          </AppText>
          <AppText variant="small" tone="muted">
            Employees must attach a PDF, JPEG or PNG up to 1 MB when they apply.
          </AppText>
        </View>
        <Switch
          value={requiresDocument}
          onValueChange={setRequiresDocument}
          disabled={submitting}
          trackColor={{ false: colors.borderStrong, true: colors.brand }}
          thumbColor={colors.surface}
          accessibilityLabel="Document required"
        />
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <AppText variant="label" tone="muted">
            Active
          </AppText>
          <AppText variant="small" tone="muted">
            Inactive types are hidden from the application form; existing records keep their history.
          </AppText>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          disabled={submitting}
          trackColor={{ false: colors.borderStrong, true: colors.brand }}
          thumbColor={colors.surface}
          accessibilityLabel="Active"
        />
      </View>

      <View style={styles.submitRow}>
        <Button
          label={submitLabel}
          icon="checkmark"
          loading={submitting}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: space.lg,
  },
  switchText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  submitRow: {
    flexDirection: 'row',
  },
});
