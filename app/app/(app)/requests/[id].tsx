import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LIMITS, type LeaveApplicationDto } from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, KeyValue, Notice, SectionTitle, Skeleton, StatusPill } from '@/components/Surface';
import { ApiError, apiFetch } from '@/lib/api';
import { TextField } from '@/components/TextField';
import { openDocument } from '@/lib/document';
import { daysLabel, formatDate, formatDateRange, formatDateTime, formatFileSize } from '@/lib/format';
import { sessionErrorMessage, useSession } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

export default function RequestDetailScreen() {
  const router = useRouter();
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const params = useLocalSearchParams<{ id: string }>();
  const id = Number(params.id);

  const [application, setApplication] = useState<LeaveApplicationDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setApplication(null);
    setError(null);
    if (!Number.isInteger(id) || id <= 0) {
      setError('That request does not exist.');
      return;
    }

    let cancelled = false;
    apiFetch<{ application: LeaveApplicationDto }>(isAdmin ? `/admin/leaves/${id}` : `/leaves/${id}`)
      .then((result) => {
        if (!cancelled) setApplication(result.application);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setError(
          loadError instanceof ApiError && loadError.status === 404
            ? 'We could not find that request.'
            : sessionErrorMessage(loadError)
        );
      });

    return () => {
      cancelled = true;
    };
  }, [id, attempt, isAdmin]);

  const isOwner = user && application ? application.userId === user.id : false;

  return (
    <Screen>
      <PageHeader
        title="Request details"
        subtitle={application ? `#${application.id} · filed ${formatDateTime(application.createdAt)}` : undefined}
        action={
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            icon="chevron-back"
            onPress={() => router.back()}
          />
        }
      />

      {error ? (
        <Card style={styles.errorCard}>
          <Notice tone="error">{error}</Notice>
          <View style={styles.errorActions}>
            <Button label="Try again" variant="secondary" size="sm" onPress={() => setAttempt((count) => count + 1)} />
            <Button label="My requests" variant="ghost" size="sm" onPress={() => router.replace('/requests')} />
          </View>
        </Card>
      ) : null}

      {application === null && !error ? (
        <Card>
          <View style={styles.skeletonBlock}>
            <Skeleton height={18} width="40%" />
            <Skeleton height={44} />
            <Skeleton height={16} width="70%" />
            <Skeleton height={16} width="55%" />
            <Skeleton height={16} width="62%" />
          </View>
        </Card>
      ) : application ? (
        <>
          <Card style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroText}>
                <AppText variant="heading">{application.leaveTypeName}</AppText>
                <AppText variant="lead" tone="muted">
                  {formatDateRange(application.startDate, application.endDate)} ·{' '}
                  {daysLabel(application.workingDays)}
                </AppText>
              </View>
              <StatusPill status={application.status} />
            </View>
            {!isOwner ? (
              <AppText variant="small" tone="muted">
                {application.employeeName} · {application.employeeEmail}
                {application.department ? ` · ${application.department}` : ''}
              </AppText>
            ) : null}
            <Timeline status={application.status} />
          </Card>

          <Card>
            <SectionTitle title="Reason" />
            <AppText variant="body" style={styles.reasonText}>
              {application.reason}
            </AppText>
          </Card>

          <View style={styles.columns}>
            <Card style={styles.column}>
              <SectionTitle title="Details" />
              <View style={styles.detailsGrid}>
                <KeyValue label="Leave type" value={application.leaveTypeName} />
                <KeyValue
                  label="Dates"
                  value={`${formatDate(application.startDate, { weekday: true })} → ${formatDate(
                    application.endDate,
                    { weekday: true }
                  )}`}
                />
                <KeyValue label="Working days" value={String(application.workingDays)} />
                <KeyValue label="Filed on" value={formatDateTime(application.createdAt)} />
                <KeyValue label="Last updated" value={formatDateTime(application.updatedAt)} />
              </View>
            </Card>

            <Card style={styles.column}>
              <SectionTitle title="Decision" />
              {application.status === 'pending' ? (
                <View style={styles.pendingNote}>
                  <Ionicons name="hourglass-outline" size={20} color={colors.warning} />
                  <AppText variant="small" tone="muted">
                    {isAdmin
                      ? 'Waiting for your decision. Approve or reject it below.'
                      : 'Waiting for your administrator. You will see the decision here.'}
                  </AppText>
                </View>
              ) : (
                <View style={styles.detailsGrid}>
                  <KeyValue
                    label={application.status === 'approved' ? 'Approved by' : 'Rejected by'}
                    value={application.decidedByName ?? 'Administrator'}
                  />
                  <KeyValue
                    label="Decided on"
                    value={application.decidedAt ? formatDateTime(application.decidedAt) : '—'}
                  />
                  {application.remarks ? (
                    <View style={styles.remarksBlock}>
                      <AppText variant="label" tone="muted">
                        Remarks
                      </AppText>
                      <AppText variant="body">{application.remarks}</AppText>
                    </View>
                  ) : null}
                </View>
              )}
            </Card>
          </View>

          {isAdmin && application.status === 'pending' ? (
            <DecisionPanel
              application={application}
              onDecided={(decided) => setApplication(decided)}
            />
          ) : null}

          <DocumentCard application={application} />
        </>
      ) : null}
    </Screen>
  );
}


function DecisionPanel({
  application,
  onDecided,
}: {
  application: LeaveApplicationDto;
  onDecided: (decided: LeaveApplicationDto) => void;
}) {
  const [remarks, setRemarks] = useState('');
  const [remarksError, setRemarksError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'approved' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'approved' | 'rejected') => {
    if (submitting) return;
    const trimmed = remarks.trim();
    if (decision === 'rejected' && trimmed.length === 0) {
      setRemarksError('Explain why the application is rejected.');
      return;
    }
    setSubmitting(decision);
    setError(null);
    setRemarksError(null);
    try {
      const result = await apiFetch<{ application: LeaveApplicationDto }>(
        `/admin/leaves/${application.id}/decision`,
        {
          method: 'POST',
          body: { decision, ...(trimmed.length > 0 ? { remarks: trimmed } : {}) },
        }
      );
      onDecided(result.application);
    } catch (decideError) {
      if (decideError instanceof ApiError && decideError.fields?.remarks) {
        setRemarksError(decideError.fields.remarks);
      } else {
        // e.g. 409 already decided, or 400 insufficient balance on approval.
        setError(sessionErrorMessage(decideError));
      }
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Card style={styles.decisionCard}>
      <SectionTitle
        title="Make a decision"
        detail="The applicant is notified through this screen; there is no email."
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <TextField
        label="Remarks for the applicant (required when rejecting)"
        value={remarks}
        onChangeText={(value) => {
          setRemarks(value);
          setRemarksError(null);
        }}
        placeholder="e.g. Approved — have a good break."
        error={remarksError}
        multiline
        numberOfLines={3}
        maxLength={LIMITS.remarks}
        editable={!submitting}
      />
      <View style={styles.decisionRow}>
        <Button
          label="Reject"
          variant="danger"
          icon="close"
          onPress={() => void decide('rejected')}
          loading={submitting === 'rejected'}
          disabled={submitting === 'approved'}
          accessibilityHint="Rejects this application and requires remarks"
        />
        <Button
          label="Approve"
          icon="checkmark"
          onPress={() => void decide('approved')}
          loading={submitting === 'approved'}
          disabled={submitting === 'rejected'}
          accessibilityHint="Approves this application and deducts the balance"
        />
      </View>
    </Card>
  );
}

function Timeline({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const steps: Array<{ label: string; state: 'done' | 'current' | 'todo' | 'failed' }> = [
    { label: 'Filed', state: 'done' },
    { label: status === 'pending' ? 'With administrator' : 'Reviewed', state: status === 'pending' ? 'current' : 'done' },
    {
      label: status === 'pending' ? 'Decision' : status === 'approved' ? 'Approved' : 'Rejected',
      state: status === 'pending' ? 'todo' : status === 'approved' ? 'done' : 'failed',
    },
  ];

  return (
    <View style={styles.timeline} accessibilityLabel={`Status: ${status}`}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const color =
          step.state === 'done' ? colors.success : step.state === 'failed' ? colors.danger : step.state === 'current' ? colors.warning : colors.border;
        return (
          <View key={step.label} style={styles.timelineStep}>
            <View style={[styles.timelineDot, { backgroundColor: color }]}>
              {step.state === 'done' ? (
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              ) : step.state === 'failed' ? (
                <Ionicons name="close" size={12} color="#FFFFFF" />
              ) : null}
            </View>
            <AppText variant="micro" tone={step.state === 'todo' ? 'faint' : 'default'} style={styles.timelineLabel}>
              {step.label}
            </AppText>
            {!isLast ? <View style={[styles.timelineLine, { backgroundColor: index < 1 ? colors.success : colors.border }]} /> : null}
          </View>
        );
      })}
    </View>
  );
}

function DocumentCard({ application }: { application: LeaveApplicationDto }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const document = application.document;

  const view = async () => {
    if (opening) return;
    setOpening(true);
    setError(null);
    try {
      await openDocument(application);
    } catch (viewError) {
      setError(viewError instanceof ApiError ? viewError.message : sessionErrorMessage(viewError));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card>
      <SectionTitle
        title="Supporting document"
        detail={document ? 'Your administrator sees the same file.' : undefined}
      />
      {document ? (
        <View style={styles.documentBody}>
          <View style={styles.fileRow}>
            <View style={styles.fileIcon}>
              <Ionicons
                name={document.mimeType === 'application/pdf' ? 'document-text-outline' : 'image-outline'}
                size={22}
                color={colors.brand}
              />
            </View>
            <View style={styles.fileText}>
              <AppText variant="body" numberOfLines={1} style={{ fontFamily: fonts.medium }}>
                {document.originalName}
              </AppText>
              <AppText variant="micro" tone="faint">
                {formatFileSize(document.sizeBytes)} · {formatDateTime(document.createdAt)}
              </AppText>
            </View>
            <Button
              label="View"
              variant="secondary"
              size="sm"
              icon="eye-outline"
              loading={opening}
              onPress={() => void view()}
            />
          </View>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </View>
      ) : (
        <AppText variant="small" tone="faint">
          No document was attached to this application.
        </AppText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  errorCard: {
    gap: space.md,
    alignItems: 'flex-start',
  },
  decisionCard: {
    gap: space.md,
  },
  decisionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.md,
  },
  errorActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  skeletonBlock: {
    gap: space.lg,
  },
  heroCard: {
    gap: space.lg,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space.lg,
    flexWrap: 'wrap',
  },
  heroText: {
    gap: space.xs,
    flexShrink: 1,
  },
  reasonText: {
    lineHeight: 24,
  },
  columns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.lg,
    alignItems: 'flex-start',
  },
  column: {
    flexGrow: 1,
    flexBasis: 280,
    gap: space.md,
  },
  detailsGrid: {
    gap: space.md,
  },
  pendingNote: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    padding: space.lg,
  },
  remarksBlock: {
    gap: space.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: space.md,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 0,
  },
  timelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLabel: {
    flexShrink: 1,
  },
  timelineLine: {
    height: 2,
    flex: 1,
    minWidth: 12,
    borderRadius: radius.pill,
  },
  documentBody: {
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
});
