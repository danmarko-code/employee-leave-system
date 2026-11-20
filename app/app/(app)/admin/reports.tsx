import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type {
  DashboardStats,
  LeaveSummaryReport,
  ReportApplicationRow,
  LeaveStatus,
  LeaveTypeDto,
} from '@leave/shared';
import { PageHeader, Screen } from '@/components/Screen';
import { AppText } from '@/components/Text';
import { Button } from '@/components/Button';
import { Card, Notice, SectionTitle, Skeleton, StatTile, StatusPill } from '@/components/Surface';
import { RequireRole } from '@/components/RequireRole';
import { TextField } from '@/components/TextField';
import { apiFetch } from '@/lib/api';
import { downloadAttachment } from '@/lib/download';
import { formatDate, formatDateTime } from '@/lib/format';
import { sessionErrorMessage } from '@/lib/session';
import { colors, fonts, radius, space } from '@/theme/tokens';

const INLINE_ROW_CAP = 25;

export default function AdminReportsScreen() {
  return (
    <RequireRole role="admin">
      <Reports />
    </RequireRole>
  );
}

function Reports() {
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<DashboardStats>('/admin/dashboard')
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen>
      <PageHeader
        title="Reports"
        subtitle="Live numbers straight from MySQL. Every report run is written to the activity log."
      />

      <View style={styles.statsRow}>
        <StatTile
          label="Waiting"
          value={stats?.pending ?? '–'}
          tone="warning"
          icon="time-outline"
        />
        <StatTile
          label="Approved"
          value={stats?.approved ?? '–'}
          tone="success"
          icon="checkmark-circle-outline"
        />
        <StatTile
          label="Rejected"
          value={stats?.rejected ?? '–'}
          tone="danger"
          icon="close-circle-outline"
        />
        <StatTile
          label="Active employees"
          value={stats?.activeEmployees ?? '–'}
          tone="brand"
          icon="people-outline"
        />
        <StatTile
          label="Active leave types"
          value={stats?.activeLeaveTypes ?? '–'}
          tone="brand"
          icon="albums-outline"
        />
      </View>

      <SummaryCard />
      <ApplicationsCard />

      <AppText variant="small" tone="faint">
        The summary uses approved and pending working days per employee and leave type. The applications
        report exports CSV with a leading apostrophe guard against spreadsheet formula injection. Both run
        as read-only queries.
      </AppText>
    </Screen>
  );
}

function SummaryCard() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [department, setDepartment] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<LeaveSummaryReport | null>(null);

  const run = async () => {
    if (running) return;
    const trimmedYear = year.trim();
    if (!/^\d{4}$/.test(trimmedYear)) {
      setError('Enter the year as four digits.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const query = new URLSearchParams({ year: trimmedYear });
      const dept = department.trim();
      if (dept) query.set('department', dept);
      setReport(await apiFetch<LeaveSummaryReport>(`/admin/reports/leave-summary?${query.toString()}`));
    } catch (runError) {
      setError(sessionErrorMessage(runError));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card style={styles.card}>
      <SectionTitle
        title="Leave summary"
        detail="Approved and pending days against yearly entitlement, per employee and type."
      />
      <View style={styles.filterRow}>
        <View style={styles.yearField}>
          <TextField
            label="Year"
            value={year}
            onChangeText={setYear}
            keyboardType="number-pad"
            maxLength={4}
            editable={!running}
          />
        </View>
        <View style={styles.deptField}>
          <TextField
            label="Department (optional)"
            value={department}
            onChangeText={setDepartment}
            placeholder="e.g. Finance"
            editable={!running}
            maxLength={100}
          />
        </View>
        <View style={styles.filterAction}>
          <Button label="Generate" icon="play" size="md" loading={running} onPress={() => void run()} />
        </View>
      </View>

      {error ? <Notice tone="error">{error}</Notice> : null}

      {report ? (
        <View style={styles.tableWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Leave summary table">
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                {['Employee', 'Department', 'Leave type', 'Entitled', 'Approved', 'Pending', 'Remaining'].map(
                  (label, index) => (
                    <View key={label} style={[styles.cell, index >= 3 && styles.cellNumeric]}>
                      <AppText variant="label" tone="muted">
                        {label}
                      </AppText>
                    </View>
                  )
                )}
              </View>
              {report.rows.map((row) => (
                <View key={`${row.userId}-${row.leaveTypeId}`} style={styles.tableRow}>
                  <View style={styles.cell}>
                    <AppText variant="small" numberOfLines={1}>{row.employeeName}</AppText>
                  </View>
                  <View style={styles.cell}>
                    <AppText variant="small" tone="muted" numberOfLines={1}>{row.department || '—'}</AppText>
                  </View>
                  <View style={styles.cell}>
                    <AppText variant="small" numberOfLines={1}>{row.leaveTypeName}</AppText>
                  </View>
                  <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular>{row.entitlement}</AppText></View>
                  <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular>{row.approvedDays}</AppText></View>
                  <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular>{row.pendingDays}</AppText></View>
                  <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular>{row.remainingDays}</AppText></View>
                </View>
              ))}
              <View style={[styles.tableRow, styles.tableFooter]}>
                <View style={styles.cell}>
                  <AppText variant="small" style={{ fontFamily: fonts.semibold }}>Totals</AppText>
                </View>
                <View style={styles.cell} />
                <View style={styles.cell} />
                <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular style={{ fontFamily: fonts.semibold }}>{report.totals.entitlement}</AppText></View>
                <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular style={{ fontFamily: fonts.semibold }}>{report.totals.approvedDays}</AppText></View>
                <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular style={{ fontFamily: fonts.semibold }}>{report.totals.pendingDays}</AppText></View>
                <View style={styles.cellNumeric} />
              </View>
            </View>
          </ScrollView>
          {report.rows.length === 0 ? (
            <AppText variant="small" tone="faint">
              No rows for {report.year}{department.trim() ? ` in “${department.trim()}”` : ''}.
            </AppText>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function ApplicationsCard() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<LeaveStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<number | 'all'>('all');
  const [types, setTypes] = useState<LeaveTypeDto[]>([]);
  const [running, setRunning] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReportApplicationRow[] | null>(null);

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

  const query = (): URLSearchParams => {
    const query_ = new URLSearchParams();
    if (from.trim()) query_.set('from', from.trim());
    if (to.trim()) query_.set('to', to.trim());
    if (status !== 'all') query_.set('status', status);
    if (typeFilter !== 'all') query_.set('leaveTypeId', String(typeFilter));
    return query_;
  };

  const run = async () => {
    if (running) return;
    for (const [label, value] of [
      ['From', from.trim()],
      ['To', to.trim()],
    ] as const) {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        setError(`${label} must be YYYY-MM-DD.`);
        return;
      }
    }
    if (from.trim() && to.trim() && from.trim() > to.trim()) {
      setError('From must be on or before To.');
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const result = await apiFetch<{ items: ReportApplicationRow[] }>(`/admin/reports/applications?${query().toString()}`);
      setRows(result.items);
    } catch (runError) {
      setError(sessionErrorMessage(runError));
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = async () => {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const csvQuery = query();
      csvQuery.set('format', 'csv');
      const stamp = new Date().toISOString().slice(0, 10);
      await downloadAttachment(
        `/admin/reports/applications?${csvQuery.toString()}`,
        `leave-applications-${stamp}.csv`,
        'text/csv'
      );
    } catch (downloadError) {
      setError(sessionErrorMessage(downloadError));
    } finally {
      setDownloading(false);
    }
  };

  const shownRows = rows ? rows.slice(0, INLINE_ROW_CAP) : null;

  return (
    <Card style={styles.card}>
      <SectionTitle
        title="Applications report"
        detail="One row per application that overlaps the filter. CSV downloads the full result."
      />
      <View style={styles.filterRow}>
        <View style={styles.dateField}>
          <TextField
            label="From"
            value={from}
            onChangeText={setFrom}
            placeholder="YYYY-MM-DD"
            editable={!running && !downloading}
            autoCapitalize="none"
            maxLength={10}
          />
        </View>
        <View style={styles.dateField}>
          <TextField
            label="To"
            value={to}
            onChangeText={setTo}
            placeholder="YYYY-MM-DD"
            editable={!running && !downloading}
            autoCapitalize="none"
            maxLength={10}
          />
        </View>
        <View style={styles.filterAction}>
          <Button label="Generate" icon="play" size="md" loading={running} onPress={() => void run()} />
        </View>
        <View style={styles.filterAction}>
          <Button
            label="CSV"
            icon="download-outline"
            variant="secondary"
            size="md"
            loading={downloading}
            onPress={() => void downloadCsv()}
            accessibilityHint="Downloads the filtered applications as a CSV file"
          />
        </View>
      </View>

      <View style={styles.chipRow}>
        {(['all', 'pending', 'approved', 'rejected'] as const).map((key) => {
          const selected = status === key;
          const label = key === 'all' ? 'All statuses' : (key[0] ?? '').toUpperCase() + key.slice(1);
          return (
            <Button
              key={key}
              label={label}
              variant={selected ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => setStatus(key)}
            />
          );
        })}
      </View>
      {types.length > 0 ? (
        <View style={styles.chipRow}>
          <Button
            label="All types"
            variant={typeFilter === 'all' ? 'primary' : 'secondary'}
            size="sm"
            onPress={() => setTypeFilter('all')}
          />
          {types.map((type) => (
            <Button
              key={type.id}
              label={type.name}
              variant={typeFilter === type.id ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => setTypeFilter(type.id)}
            />
          ))}
        </View>
      ) : null}

      {error ? <Notice tone="error">{error}</Notice> : null}

      {shownRows ? (
        <View style={styles.tableWrap}>
          <AppText variant="small" tone="muted">
            {rows?.length ?? 0} {rows?.length === 1 ? 'row' : 'rows'}
            {rows && rows.length > INLINE_ROW_CAP
              ? ` — showing the first ${INLINE_ROW_CAP}; the CSV download contains all of them`
              : ''}
          </AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Applications report table">
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                {['Employee', 'Type', 'Dates', 'Days', 'Status', 'Decided by', 'Decided at'].map((label, index) => (
                  <View key={label} style={[styles.cell, index === 3 && styles.cellNumeric]}>
                    <AppText variant="label" tone="muted">
                      {label}
                    </AppText>
                  </View>
                ))}
              </View>
              {shownRows.map((row) => (
                <View key={row.id} style={styles.tableRow}>
                  <View style={styles.cell}>
                    <AppText variant="small" numberOfLines={1}>{row.employeeName}</AppText>
                    <AppText variant="micro" tone="faint" numberOfLines={1}>{row.department || '—'}</AppText>
                  </View>
                  <View style={styles.cell}><AppText variant="small" numberOfLines={1}>{row.leaveTypeName}</AppText></View>
                  <View style={styles.cell}><AppText variant="small">{formatDate(row.startDate)} → {formatDate(row.endDate)}</AppText></View>
                  <View style={[styles.cell, styles.cellNumeric]}><AppText variant="small" tabular>{row.workingDays}</AppText></View>
                  <View style={styles.cell}><StatusPill status={row.status} /></View>
                  <View style={styles.cell}><AppText variant="small" tone="muted" numberOfLines={1}>{row.decidedByName ?? '—'}</AppText></View>
                  <View style={styles.cell}><AppText variant="small" tone="muted">{row.decidedAt ? formatDateTime(row.decidedAt) : '—'}</AppText></View>
                </View>
              ))}
              {shownRows.length === 0 ? (
                <View style={styles.tableEmpty}>
                  <AppText variant="small" tone="faint">
                    No applications match these filters.
                  </AppText>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  card: {
    gap: space.md,
    maxWidth: 1100,
  },
  filterRow: {
    flexDirection: 'row',
    gap: space.md,
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  yearField: {
    width: 120,
  },
  deptField: {
    flex: 1,
    minWidth: 180,
    maxWidth: 320,
  },
  dateField: {
    width: 160,
  },
  filterAction: {
    justifyContent: 'flex-end',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tableWrap: {
    gap: space.sm,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  tableRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tableHeader: {
    borderTopWidth: 0,
    backgroundColor: colors.surfaceMuted,
  },
  tableFooter: {
    backgroundColor: colors.surfaceMuted,
  },
  tableEmpty: {
    padding: space.lg,
  },
  cell: {
    width: 150,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    gap: 1,
  },
  cellNumeric: {
    width: 104,
    alignItems: 'center',
  },
});
