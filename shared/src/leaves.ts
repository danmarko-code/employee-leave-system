import { z } from 'zod';
import { DOCUMENT_MIME_TYPES, LEAVE_STATUSES, LIMITS } from './constants';
import { idSchema, isoDateSchema } from './validation';

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

export const leaveTypeCreateSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter a leave type name.').max(LIMITS.name),
  yearlyEntitlement: z.coerce.number().int().min(0, 'Cannot be negative.').max(365),
  requiresDocument: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const leaveTypeUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter a leave type name.').max(LIMITS.name).optional(),
    yearlyEntitlement: z.coerce.number().int().min(0).max(365).optional(),
    requiresDocument: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export type LeaveTypeCreateInput = z.infer<typeof leaveTypeCreateSchema>;
export type LeaveTypeUpdateInput = z.infer<typeof leaveTypeUpdateSchema>;

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/** Fields arrive as multipart text, so numbers/dates are coerced. */
export const leaveCreateSchema = z
  .strictObject({
    leaveTypeId: idSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z
      .string()
      .trim()
      .min(1, 'Enter a reason.')
      .max(LIMITS.reason, `Reason must be ${LIMITS.reason} characters or fewer.`),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'The end date must be on or after the start date.',
    path: ['endDate'],
  })
  .refine((value) => value.startDate.slice(0, 4) === value.endDate.slice(0, 4), {
    message: 'A single application cannot span two calendar years.',
    path: ['endDate'],
  });

export const leaveDecisionSchema = z
  .strictObject({
    decision: z.enum(['approved', 'rejected']),
    remarks: z
      .string()
      .trim()
      .max(LIMITS.remarks, `Remarks must be ${LIMITS.remarks} characters or fewer.`)
      .optional(),
  })
  .refine((value) => value.decision !== 'rejected' || Boolean(value.remarks), {
    message: 'Explain why the application is rejected.',
    path: ['remarks'],
  });

export const leaveListQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(25),
    status: z.enum(LEAVE_STATUSES).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  });

export const adminLeaveListQuerySchema = leaveListQuerySchema.extend({
  leaveTypeId: z.coerce.number().int().positive().optional(),
  userId: z.coerce.number().int().positive().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
});

export const balanceQuerySchema = z.strictObject({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

export type LeaveCreateInput = z.infer<typeof leaveCreateSchema>;
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;
export type LeaveListQuery = z.infer<typeof leaveListQuerySchema>;
export type AdminLeaveListQuery = z.infer<typeof adminLeaveListQuerySchema>;
export type BalanceQuery = z.infer<typeof balanceQuerySchema>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface LeaveTypeDto {
  id: number;
  name: string;
  yearlyEntitlement: number;
  requiresDocument: boolean;
  isActive: boolean;
}

export interface LeaveBalanceDto extends LeaveTypeDto {
  year: number;
  approvedDays: number;
  pendingDays: number;
  remainingDays: number;
}

export interface LeaveDocumentDto {
  id: number;
  originalName: string;
  mimeType: (typeof DOCUMENT_MIME_TYPES)[number];
  sizeBytes: number;
  createdAt: string;
}

export interface LeaveApplicationDto {
  id: number;
  userId: number;
  employeeName: string;
  employeeEmail: string;
  department: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  reason: string;
  status: (typeof LEAVE_STATUSES)[number];
  decidedByName: string | null;
  decidedAt: string | null;
  remarks: string | null;
  createdAt: string;
  updatedAt: string;
  document: LeaveDocumentDto | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export const holidayCreateSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter a holiday name.').max(LIMITS.name),
    date: isoDateSchema,
  });

export const holidayDeleteSchema = z.strictObject({
  id: idSchema,
});

export type HolidayCreateInput = z.infer<typeof holidayCreateSchema>;
export type HolidayDeleteInput = z.infer<typeof holidayDeleteSchema>;
