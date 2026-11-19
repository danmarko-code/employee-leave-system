import { z } from 'zod';
import { LEAVE_STATUSES } from './constants';
import { isoDateSchema } from './validation';

export const summaryReportQuerySchema = z
  .strictObject({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    department: z.string().trim().min(1).max(100).optional(),
  })
  .refine((value) => !value.department || value.department.length > 0, { message: 'Invalid department.' });

export const applicationsReportQuerySchema = z
  .strictObject({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    status: z.enum(LEAVE_STATUSES).optional(),
    leaveTypeId: z.coerce.number().int().positive().optional(),
    userId: z.coerce.number().int().positive().optional(),
    format: z.enum(['json', 'csv']).default('json'),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'The start of the range must be before the end.',
    path: ['from'],
  });

export type SummaryReportQuery = z.infer<typeof summaryReportQuerySchema>;
export type ApplicationsReportQuery = z.infer<typeof applicationsReportQuerySchema>;

export interface LeaveSummaryRow {
  userId: number;
  employeeName: string;
  department: string;
  leaveTypeId: number;
  leaveTypeName: string;
  entitlement: number;
  approvedDays: number;
  pendingDays: number;
  remainingDays: number;
}

export interface LeaveSummaryReport {
  year: number;
  rows: LeaveSummaryRow[];
  totals: {
    entitlement: number;
    approvedDays: number;
    pendingDays: number;
  };
}

export interface ReportApplicationRow {
  id: number;
  employeeName: string;
  department: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  status: (typeof LEAVE_STATUSES)[number];
  decidedByName: string | null;
  decidedAt: string | null;
}

export interface DashboardStats {
  pending: number;
  approved: number;
  rejected: number;
  activeEmployees: number;
  activeLeaveTypes: number;
}
