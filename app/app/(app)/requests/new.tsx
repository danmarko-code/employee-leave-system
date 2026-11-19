import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LeaveApplicationDto, LeaveBalanceDto, LeaveTypeDto } from '@leave/shared';
import { LIMITS } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button, IconButton } from '@/components/Button';
import { Card, Notice, SectionTitle, Skeleton } from '@/components/Surface';
import { TextField } from '@/components/TextField';
import { ApiError, apiFetch } from '@/lib/api';
import {
  buildApplicationForm,
  pickDocument,
  type PickedDocument,
} from '@/lib/document';
import { countWorkingDays, isIsoDate, sameYear, todayIso } from '@/lib/dates';
import { formatFileSize } from '@/lib/format';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function ApplyScreen() {
  const router = useRouter();
  const { user } = useSession();

  const [types, setTypes] = useState<LeaveTypeDto[] | null>(null);
  const [balances, setBalances] = useState<Map<number, LeaveBalanceDto>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const [leaveTypeId, setLeaveTypeId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [document, setDocument] = useState<PickedDocument | null>(null);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    const load = async () => {
      try {
        const year = new Date().getUTCFullYear();
        const [typesResult, balancesResult] = await Promise.all([
          apiFetch<{ items: LeaveTypeDto[] }>('/leave-types'),
          apiFetch<{ items: LeaveBalanceDto[] }>(`/leave-balances?year=${year}`),
        ]);
        if (cancelled) return;
        setTypes(typesResult.items);
        setBalances(new Map(balancesResult.items.map((balance) => [balance.id, balance])));
      } catch (error) {
        if (!cancelled) setLoadError(sessionErrorMessage(error));
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const selectedType = types?.find((type) => type.id === leaveTypeId) ?? null;
  const workingDays = isIsoDate(startDate) && isIsoDate(endDate) ? countWorkingDays(startDate, endDate) : null;
  const remaining = selectedType ? balances.get(selectedType.id)?.remainingDays : undefined;
  const exceeds = workingDays !== null && remaining !== undefined && workingDays > remaining;

  const clientErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    if (startDate && !isIsoDate(startDate)) errors.startDate = 'Use the format YYYY-MM-DD.';
    if (endDate && !isIsoDate(endDate)) errors.endDate = 'Use the format YYYY-MM-DD.';
    if (!errors.startDate && !errors.endDate && isIsoDate(startDate) && isIsoDate(endDate)) {
      if (endDate < startDate) errors.endDate = 'The end date must be on or after the start date.';
      else if (!sameYear(startDate, endDate)) errors.endDate = 'One application cannot span two calendar years.';
      else {
        if (startDate < todayIso()) errors.startDate = 'Choose today or a later date.';
        const days = countWorkingDays(startDate, endDate);
        if (days === 0) errors.startDate = 'Those dates contain no working days (Monday to Friday).';
      }
    }
    if (reason.length > LIMITS.reason) errors.reason = `Keep the reason to ${LIMITS.reason} characters.`;
    if (selectedType?.requiresDocument && !document) {
      errors.document = `${selectedType.name} applications need a supporting document.`;
    }
    return errors;
  }, [startDate, endDate, reason, selectedType, document]);

  if (user && user.role !== 'employee') {
    return (
      <Screen>
        <PageHeader title="Apply for leave" />
        <Card>
          <Notice tone="info">Administrators review applications rather than filing them.</Notice>
        </Card>
      </Screen>
    );
  }

  const chooseDocument = async () => {
    const result = await pickDocument();
    if ('error' in result) {
      setFields((current) => ({ ...current, document: result.error }));
      return;
    }
    if ('cancelled' in result) return;
    setDocument(result.document);
    setFields((current) => {
      const { document: _dropped, ...rest } = current;
      return rest;
    });
  };

  const submit = async () => {
    if (submitting) return;

    const errors: Record<string, string> = { ...clientErrors };
    if (leaveTypeId === null) errors.leaveType = 'Choose a leave type.';
    if (!startDate) errors.startDate = 'Enter a start date.';
    if (!endDate) errors.endDate = 'Enter an end date.';
    if (!reason.trim()) errors.reason = 'Enter a reason.';
    setFields(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const form = await buildApplicationForm({
        leaveTypeId: leaveTypeId as number,
        startDate,
        endDate,
        reason: reason.trim(),
        document,
      });
      const result = await apiFetch<{ application: LeaveApplicationDto }>('/leaves', {
        method: 'POST',
        form,
      });
      router.replace(`/requests/${result.application.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        if (Object.keys(error.fields).length > 0) {
          setFields(error.fields);
        }
        if (error.code === 'insufficient_balance' || error.status === 409) {
          setFormError(error.message);
        } else if (Object.keys(error.fields).length === 0) {
          setFormError(error.message);
        }
      } else {
        setFormError(sessionErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting &&
    types !== null &&
    leaveTypeId !== null &&
    Object.keys(clientErrors).length === 0 &&
    !exceeds;

  return (
    <Screen>
      <PageHeader
        title="Apply for leave"
        subtitle="Count working days, attach a document when required, and file it for your administrator to review."
      />

      <View style={styles.formColumn}>
        {loadError ? (
          <Card style={styles.errorCard}>
            <Notice tone="error">{loadError}</Notice>
            <Button
              label="Try again"
              variant="secondary"
              size="sm"
              onPress={() => setAttempt((count) => count + 1)}
            />
          </Card>
        ) : null}

        {formError ? (
          <Card>
            <Notice tone="error">{formError}</Notice>
          </Card>
        ) : null}

        {types === null && !loadError ? (
          <Card>
            <View style={styles.skeletonBlock}>
              <Skeleton height={14} width="30%" />
              <Skeleton height={44} />
              <Skeleton height={44} />
              <Skeleton height={44} />
            </View>
          </Card>
        ) : types && types.length > 0 ? (
          <Card>
            <SectionTitle title="Leave type" detail="Your yearly entitlement and whether a document is required." />
            {fields.leaveType ? (
              <AppText variant="small" tone="danger">
                {fields.leaveType}
              </AppText>
            ) : null}
            <View style={styles.typeList}>
              {types.map((type) => {
                const selected = type.id === leaveTypeId;
                const balance = balances.get(type.id);
                return (
                  <Pressable
                    key={type.id}
                    onPress={() => {
                      setLeaveTypeId(type.id);
                      setFields((current) => {
                        const { leaveType: _dropped, ...rest } = current;
                        return rest;
                      });
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${type.name}, ${type.yearlyEntitlement} days per year${
                      type.requiresDocument ? ', document required' : ''
                    }`}
                    style={({ pressed }) => [
                      styles.typeRow,
                      selected && styles.typeRowSelected,
                      pressed && !selected && styles.typeRowPressed,
                    ]}
                  >
                    <Ionicons
                      name={selected ? 'radio-button-on' : 'radio-button-off-outline'}
                      size={22}
                      color={selected ? colors.brand : colors.faint}
                    />
                    <View style={styles.typeText}>
                      <AppText variant="body" style={{ fontFamily: fonts.semibold }}>
                        {type.name}
                      </AppText>
                      <AppText variant="small" tone="muted" tabular>
                        {balance
                          ? `${balance.remainingDays} of ${type.yearlyEntitlement} left · ${balance.pendingDays} pending set aside`
                          : `${type.yearlyEntitlement} days per year`}
                      </AppText>
                    </View>
                    {type.requiresDocument ? (
                      <View style={styles.docBadge}>
                        <Ionicons name="document-text-outline" size={13} color={colors.warning} />
                        <AppText variant="micro" style={{ color: colors.warning, fontFamily: fonts.medium }}>
                          Document
                        </AppText>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        ) : types ? (
          <Card>
            <Notice tone="info">No leave types are available. Your administrator manages this list.</Notice>
          </Card>
        ) : null}

        <Card>
          <SectionTitle title="Dates" detail="Working days are Monday to Friday. Holidays are not counted." />
          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <TextField
                label="Start date"
                value={startDate}
                onChangeText={(value) => {
                  setStartDate(value);
                  setFields((current) => {
                  const { startDate: _dropped, ...rest } = current;
                  return rest;
                });
                }}
                placeholder={`${new Date().getUTCFullYear()}-12-14`}
                error={fields.startDate ?? clientErrors.startDate ?? null}
                autoComplete="off"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                editable={!submitting}
              />
            </View>
            <View style={styles.dateField}>
              <TextField
                label="End date"
                value={endDate}
                onChangeText={(value) => {
                  setEndDate(value);
                  setFields((current) => {
                  const { endDate: _dropped, ...rest } = current;
                  return rest;
                });
                }}
                placeholder={`${new Date().getUTCFullYear()}-12-16`}
                error={fields.endDate ?? clientErrors.endDate ?? null}
                autoComplete="off"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                editable={!submitting}
              />
            </View>
          </View>
          <View style={styles.summaryLine}>
            <Ionicons name="calendar-outline" size={16} color={colors.faint} />
            <AppText variant="small" tone={exceeds ? 'danger' : 'muted'}>
              {workingDays === null
                ? 'Choose both dates to count the working days.'
                : exceeds
                  ? `${workingDays} working ${workingDays === 1 ? 'day' : 'days'} — more than your ${remaining} remaining.`
                  : `${workingDays} working ${workingDays === 1 ? 'day' : 'days'} will be used.`}
            </AppText>
          </View>
        </Card>

        <Card>
          <View style={styles.reasonHeader}>
            <SectionTitle title="Reason" />
            <AppText variant="micro" tone="faint" tabular>
              {reason.length}/{LIMITS.reason}
            </AppText>
          </View>
          <TextField
            label="Why you need this leave"
            value={reason}
            onChangeText={(value) => {
              setReason(value);
              setFields((current) => {
                  const { reason: _dropped, ...rest } = current;
                  return rest;
                });
            }}
            placeholder="e.g. Family event, doctor's appointment…"
            error={fields.reason ?? clientErrors.reason ?? null}
            multiline
            numberOfLines={4}
            maxLength={LIMITS.reason + 1}
            editable={!submitting}
          />
        </Card>

        <Card>
          <SectionTitle
            title="Supporting document"
            detail={
              selectedType?.requiresDocument
                ? `Required for ${selectedType.name}. PDF, JPEG or PNG, up to 1 MB.`
                : 'Optional. PDF, JPEG or PNG, up to 1 MB.'
            }
          />
          {fields.document ?? clientErrors.document ? (
            <AppText variant="small" tone="danger">
              {fields.document ?? clientErrors.document}
            </AppText>
          ) : null}
          {document ? (
            <View style={styles.fileRow}>
              <View style={styles.fileIcon}>
                <Ionicons
                  name={document.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'}
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={styles.fileText}>
                <AppText variant="small" numberOfLines={1} style={{ fontFamily: fonts.medium }}>
                  {document.name}
                </AppText>
                <AppText variant="micro" tone="faint">
                  {document.sizeBytes > 0 ? formatFileSize(document.sizeBytes) : 'Attached'} · ready to attach
                </AppText>
              </View>
              <IconButton
                icon="close"
                label="Remove document"
                onPress={() => setDocument(null)}
                tone="muted"
              />
            </View>
          ) : (
            <View>
              <Button
                label="Attach document"
                variant="secondary"
                size="sm"
                icon="attach"
                onPress={() => void chooseDocument()}
                disabled={submitting}
              />
            </View>
          )}
        </Card>

        <View style={styles.submitRow}>
          <Button
            label="Submit application"
            icon="send"
            fullWidth
            loading={submitting}
            disabled={!canSubmit}
            onPress={() => void submit()}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formColumn: {
    gap: space.lg,
    width: '100%',
    maxWidth: 760,
  },
  errorCard: {
    gap: space.md,
    alignItems: 'flex-start',
  },
  skeletonBlock: {
    gap: space.lg,
  },
  typeList: {
    gap: space.sm,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.control,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  typeRowSelected: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  typeRowPressed: {
    backgroundColor: colors.surface,
  },
  typeText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  docBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingVertical: 3,
    paddingHorizontal: space.sm,
  },
  dateRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  dateField: {
    flex: 1,
  },
  summaryLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.md,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  fileIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileText: {
    flex: 1,
    gap: 2,
    flexShrink: 1,
  },
  submitRow: {
    flexDirection: 'row',
  },
});
