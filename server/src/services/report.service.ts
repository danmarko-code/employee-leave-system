import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  ApplicationsReportQuery,
  DashboardStats,
  LeaveSummaryReport,
  LeaveSummaryRow,
  ReportApplicationRow,
  SummaryReportQuery,
} from '@leave/shared';
import { query, queryOne } from '../db/query';
import { logActivity } from './activity.service';

interface SummaryDbRow extends RowDataPacket {
  user_id: number;
  employee_name: string;
  department: string;
  leave_type_id: number;
  leave_type_name: string;
  yearly_entitlement: number;
  approved_days: number | string;
  pending_days: number | string;
}

export async function leaveSummary(
  pool: Pool,
  queryParams: SummaryReportQuery,
  fallbackYear: number
): Promise<LeaveSummaryReport> {
  const year = queryParams.year ?? fallbackYear;
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const department = queryParams.department ?? null;

  const rows = await query<SummaryDbRow>(
    pool,
    `SELECT u.id AS user_id, u.name AS employee_name, u.department,
            lt.id AS leave_type_id, lt.name AS leave_type_name, lt.yearly_entitlement,
            COALESCE(SUM(CASE WHEN la.status = 'approved' THEN la.working_days ELSE 0 END), 0) AS approved_days,
            COALESCE(SUM(CASE WHEN la.status = 'pending'  THEN la.working_days ELSE 0 END), 0) AS pending_days
       FROM users u
       JOIN leave_types lt ON lt.is_active = 1
       LEFT JOIN leave_applications la
         ON la.user_id = u.id
        AND la.leave_type_id = lt.id
        AND la.start_date >= ?
        AND la.start_date < ?
      WHERE u.role = 'employee' AND u.is_active = 1
        AND (? IS NULL OR u.department = ?)
      GROUP BY u.id, u.name, u.department, lt.id, lt.name, lt.yearly_entitlement
      ORDER BY u.name ASC, lt.name ASC`,
    [from, to, department, department]
  );

  const mapped: LeaveSummaryRow[] = rows.map((row) => {
    const approvedDays = Number(row.approved_days);
    const pendingDays = Number(row.pending_days);
    return {
      userId: row.user_id,
      employeeName: row.employee_name,
      department: row.department,
      leaveTypeId: row.leave_type_id,
      leaveTypeName: row.leave_type_name,
      entitlement: row.yearly_entitlement,
      approvedDays,
      pendingDays,
      remainingDays: Math.max(0, row.yearly_entitlement - approvedDays - pendingDays),
    };
  });

  return {
    year,
    rows: mapped,
    totals: {
      entitlement: mapped.reduce((sum, row) => sum + row.entitlement, 0),
      approvedDays: mapped.reduce((sum, row) => sum + row.approvedDays, 0),
      pendingDays: mapped.reduce((sum, row) => sum + row.pendingDays, 0),
    },
  };
}

interface ReportRow extends RowDataPacket {
  id: number;
  employee_name: string;
  department: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  working_days: number;
  status: 'pending' | 'approved' | 'rejected';
  decided_by_name: string | null;
  decided_at: string | null;
}

export async function applicationsReport(
  pool: Pool,
  filters: ApplicationsReportQuery
): Promise<ReportApplicationRow[]> {
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const status = filters.status ?? null;
  const leaveTypeId = filters.leaveTypeId ?? null;
  const userId = filters.userId ?? null;

  const rows = await query<ReportRow>(
    pool,
    `SELECT la.id, u.name AS employee_name, u.department, lt.name AS leave_type_name,
            la.start_date, la.end_date, la.working_days, la.status,
            d.name AS decided_by_name, la.decided_at
       FROM leave_applications la
       JOIN users u ON u.id = la.user_id
       JOIN leave_types lt ON lt.id = la.leave_type_id
       LEFT JOIN users d ON d.id = la.decided_by
      WHERE (? IS NULL OR la.end_date >= ?)
        AND (? IS NULL OR la.start_date <= ?)
        AND (? IS NULL OR la.status = ?)
        AND (? IS NULL OR la.leave_type_id = ?)
        AND (? IS NULL OR la.user_id = ?)
      ORDER BY la.start_date DESC, la.id DESC
      LIMIT 5000`,
    [
      from, from,
      to, to,
      status, status,
      leaveTypeId, leaveTypeId,
      userId, userId,
    ]
  );

  return rows.map((row) => ({
    id: row.id,
    employeeName: row.employee_name,
    department: row.department,
    leaveTypeName: row.leave_type_name,
    startDate: row.start_date,
    endDate: row.end_date,
    workingDays: row.working_days,
    status: row.status,
    decidedByName: row.decided_by_name,
    decidedAt: row.decided_at ? `${row.decided_at.replace(' ', 'T')}Z` : null,
  }));
}

const CSV_COLUMNS: Array<[string, (row: ReportApplicationRow) => string | number]> = [
  ['ID', (row) => row.id],
  ['Employee', (row) => row.employeeName],
  ['Department', (row) => row.department],
  ['Leave type', (row) => row.leaveTypeName],
  ['Start date', (row) => row.startDate],
  ['End date', (row) => row.endDate],
  ['Working days', (row) => row.workingDays],
  ['Status', (row) => row.status],
  ['Decided by', (row) => row.decidedByName ?? ''],
  ['Decided at', (row) => row.decidedAt ?? ''],
];

function csvCell(value: string | number): string {
  let text = String(value).replace(/[\r\n]+/g, ' ');
  // Spreadsheet formula injection: a leading = + - @ or tab would run as a
  // formula in Excel/Sheets, so neutralise it with a leading apostrophe.
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function applicationsReportCsv(rows: ReportApplicationRow[]): string {
  const header = CSV_COLUMNS.map(([label]) => csvCell(label)).join(',');
  const body = rows.map((row) => CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(','));
  return [header, ...body].join('\r\n');
}

export async function dashboardStats(pool: Pool): Promise<DashboardStats> {
  const row = await queryOne<RowDataPacket & DashboardStats>(
    pool,
    `SELECT
       (SELECT COUNT(*) FROM leave_applications WHERE status = 'pending')  AS pending,
       (SELECT COUNT(*) FROM leave_applications WHERE status = 'approved') AS approved,
       (SELECT COUNT(*) FROM leave_applications WHERE status = 'rejected') AS rejected,
       (SELECT COUNT(*) FROM users WHERE role = 'employee' AND is_active = 1) AS activeEmployees,
       (SELECT COUNT(*) FROM leave_types WHERE is_active = 1) AS activeLeaveTypes`
  );

  return {
    pending: Number(row?.pending ?? 0),
    approved: Number(row?.approved ?? 0),
    rejected: Number(row?.rejected ?? 0),
    activeEmployees: Number(row?.activeEmployees ?? 0),
    activeLeaveTypes: Number(row?.activeLeaveTypes ?? 0),
  };
}

export async function auditReport(
  pool: Pool,
  actorId: number,
  targetType: string,
  ip: string | null
): Promise<void> {
  await logActivity(pool, {
    userId: actorId,
    action: 'report_generated',
    targetType,
    ip,
  });
}
