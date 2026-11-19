import type { Pool, RowDataPacket } from 'mysql2/promise';
import path from 'node:path';
import type {
  AdminLeaveListQuery,
  LeaveApplicationDto,
  LeaveCreateInput,
  LeaveDecisionInput,
  LeaveListQuery,
  Page,
} from '@leave/shared';
import { query, queryOne, withTransaction, execute } from '../db/query';
import { AppError, conflict, invalidInput, notFound, unauthorized } from '../lib/errors';
import { countWorkingDays, currentYearUtc, nextYearStart, sqlDateTimeToIso, todayUtc } from '../lib/dates';
import {
  newStoredName,
  removeUpload,
  sha256,
  writeUpload,
  type AllowedMime,
} from '../lib/files';
import { logger, safeErrorFacts } from '../lib/logger';
import { logActivity } from './activity.service';

interface ApplicationRow extends RowDataPacket {
  id: number;
  user_id: number;
  employee_name: string;
  employee_email: string;
  department: string;
  leave_type_id: number;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  working_days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decided_by_name: string | null;
  decided_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  doc_id: number | null;
  doc_original_name: string | null;
  doc_mime_type: string | null;
  doc_size_bytes: number | null;
  doc_created_at: string | null;
}

const APPLICATION_SELECT = `SELECT la.id, la.user_id, u.name AS employee_name, u.email AS employee_email,
       u.department, la.leave_type_id, lt.name AS leave_type_name,
       la.start_date, la.end_date, la.working_days, la.reason, la.status,
       d.name AS decided_by_name, la.decided_at, la.remarks, la.created_at, la.updated_at,
       doc.id AS doc_id, doc.original_name AS doc_original_name,
       doc.mime_type AS doc_mime_type, doc.size_bytes AS doc_size_bytes,
       doc.created_at AS doc_created_at
  FROM leave_applications la
  JOIN users u ON u.id = la.user_id
  JOIN leave_types lt ON lt.id = la.leave_type_id
  LEFT JOIN users d ON d.id = la.decided_by
  LEFT JOIN documents doc ON doc.application_id = la.id`;

function toDto(row: ApplicationRow): LeaveApplicationDto {
  return {
    id: row.id,
    userId: row.user_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    department: row.department,
    leaveTypeId: row.leave_type_id,
    leaveTypeName: row.leave_type_name,
    startDate: row.start_date,
    endDate: row.end_date,
    workingDays: row.working_days,
    reason: row.reason,
    status: row.status,
    decidedByName: row.decided_by_name,
    decidedAt: sqlDateTimeToIso(row.decided_at),
    remarks: row.remarks,
    createdAt: sqlDateTimeToIso(row.created_at) ?? '',
    updatedAt: sqlDateTimeToIso(row.updated_at) ?? '',
    document:
      row.doc_id !== null
        ? {
            id: row.doc_id,
            originalName: row.doc_original_name ?? 'document',
            mimeType: (row.doc_mime_type ?? 'application/pdf') as
              | 'application/pdf'
              | 'image/jpeg'
              | 'image/png',
            sizeBytes: row.doc_size_bytes ?? 0,
            createdAt: sqlDateTimeToIso(row.doc_created_at) ?? '',
          }
        : null,
  };
}

export interface UploadedFile {
  buffer: Buffer;
  mime: AllowedMime;
  originalName: string;
}

function yearRangeOf(date: string): { from: string; to: string } {
  const year = Number(date.slice(0, 4));
  return { from: `${year}-01-01`, to: `${year + 1}-01-01` };
}

export async function listMyLeaves(
  pool: Pool,
  userId: number,
  filters: LeaveListQuery
): Promise<Page<LeaveApplicationDto>> {
  const status = filters.status ?? null;
  const year = filters.year ?? null;
  const from = year ? `${year}-01-01` : null;
  const to = year ? `${year + 1}-01-01` : null;
  const offset = (filters.page - 1) * filters.pageSize;

  const rows = await query<ApplicationRow>(
    pool,
    `${APPLICATION_SELECT}
      WHERE la.user_id = ?
        AND (? IS NULL OR la.status = ?)
        AND (? IS NULL OR (la.start_date >= ? AND la.start_date < ?))
      ORDER BY la.start_date DESC, la.id DESC
      LIMIT ? OFFSET ?`,
    [userId, status, status, from, from, to, filters.pageSize, offset]
  );

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    pool,
    `SELECT COUNT(*) AS total
       FROM leave_applications la
      WHERE la.user_id = ?
        AND (? IS NULL OR la.status = ?)
        AND (? IS NULL OR (la.start_date >= ? AND la.start_date < ?))`,
    [userId, status, status, from, from, to]
  );

  return {
    items: rows.map(toDto),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(totalRow?.total ?? 0),
  };
}

export async function listAllLeaves(
  pool: Pool,
  filters: AdminLeaveListQuery
): Promise<Page<LeaveApplicationDto>> {
  const status = filters.status ?? null;
  const leaveTypeId = filters.leaveTypeId ?? null;
  const userId = filters.userId ?? null;
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const search = filters.q ? `%${filters.q.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : null;
  const offset = (filters.page - 1) * filters.pageSize;

  const rows = await query<ApplicationRow>(
    pool,
    `${APPLICATION_SELECT}
      WHERE (? IS NULL OR la.status = ?)
        AND (? IS NULL OR la.leave_type_id = ?)
        AND (? IS NULL OR la.user_id = ?)
        AND (? IS NULL OR la.end_date >= ?)
        AND (? IS NULL OR la.start_date <= ?)
        AND (? IS NULL OR u.name LIKE ? OR u.email LIKE ?)
      ORDER BY la.created_at DESC, la.id DESC
      LIMIT ? OFFSET ?`,
    [
      status, status,
      leaveTypeId, leaveTypeId,
      userId, userId,
      from, from,
      to, to,
      search, search, search,
      filters.pageSize, offset,
    ]
  );

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    pool,
    `SELECT COUNT(*) AS total
       FROM leave_applications la
       JOIN users u ON u.id = la.user_id
      WHERE (? IS NULL OR la.status = ?)
        AND (? IS NULL OR la.leave_type_id = ?)
        AND (? IS NULL OR la.user_id = ?)
        AND (? IS NULL OR la.end_date >= ?)
        AND (? IS NULL OR la.start_date <= ?)
        AND (? IS NULL OR u.name LIKE ? OR u.email LIKE ?)`,
    [
      status, status,
      leaveTypeId, leaveTypeId,
      userId, userId,
      from, from,
      to, to,
      search, search, search,
    ]
  );

  return {
    items: rows.map(toDto),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(totalRow?.total ?? 0),
  };
}

/** Owner or administrator only; anything else is a 404, not a 403. */
export async function getApplication(
  pool: Pool,
  id: number,
  viewerId: number,
  isAdmin: boolean
): Promise<LeaveApplicationDto> {
  const row = await queryOne<ApplicationRow>(
    pool,
    `${APPLICATION_SELECT}
      WHERE la.id = ? AND (la.user_id = ? OR ? = 1)
      LIMIT 1`,
    [id, viewerId, isAdmin ? 1 : 0]
  );
  if (!row) throw notFound();
  return toDto(row);
}

export interface DocumentDownload {
  absolutePath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

export async function getDocumentForViewer(
  pool: Pool,
  applicationId: number,
  viewerId: number,
  isAdmin: boolean,
  uploadDir: string
): Promise<DocumentDownload> {
  const row = await queryOne<
    RowDataPacket & {
      stored_name: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
    }
  >(
    pool,
    `SELECT d.stored_name, d.original_name, d.mime_type, d.size_bytes
       FROM documents d
       JOIN leave_applications la ON la.id = d.application_id
      WHERE d.application_id = ? AND (la.user_id = ? OR ? = 1)
      LIMIT 1`,
    [applicationId, viewerId, isAdmin ? 1 : 0]
  );
  if (!row) throw notFound();

  return {
    absolutePath: path.join(uploadDir, row.stored_name),
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
  };
}

/**
 * Creates an application and, when present, its one supporting document.
 * Business checks run under a lock on the user's row, so two concurrent
 * submissions cannot both pass the overlap or balance test.
 */
export async function createApplication(
  pool: Pool,
  config: { uploadDir: string },
  userId: number,
  input: LeaveCreateInput,
  file: UploadedFile | null,
  ip: string | null
): Promise<LeaveApplicationDto> {
  const workingDays = countWorkingDays(input.startDate, input.endDate);
  if (workingDays === 0) {
    throw invalidInput({ startDate: 'The selected dates contain no working days.' });
  }

  const today = todayUtc();
  if (input.startDate < today) {
    throw invalidInput({ startDate: 'Choose today or a later date.' });
  }
  const currentYear = currentYearUtc();
  const year = Number(input.startDate.slice(0, 4));
  if (year < currentYear || year > currentYear + 1) {
    throw invalidInput({ startDate: 'Applications can only be filed for this year or next year.' });
  }

  const type = await queryOne<
    RowDataPacket & {
      name: string;
      yearly_entitlement: number;
      requires_document: number;
      is_active: number;
    }
  >(
    pool,
    'SELECT name, yearly_entitlement, requires_document, is_active FROM leave_types WHERE id = ?',
    [input.leaveTypeId]
  );
  if (!type || type.is_active !== 1) {
    throw invalidInput({ leaveTypeId: 'That leave type is not available.' });
  }
  if (type.requires_document === 1 && !file) {
    throw invalidInput({ document: 'This leave type needs a supporting document.' });
  }

  const { from, to } = yearRangeOf(input.startDate);
  let storedName: string | null = null;

  try {
    const applicationId = await withTransaction(pool, async (connection) => {
      const user = await queryOne<RowDataPacket & { id: number }>(
        connection,
        'SELECT id FROM users WHERE id = ? AND is_active = 1 FOR UPDATE',
        [userId]
      );
      if (!user) throw unauthorized();

      const overlap = await queryOne<RowDataPacket & { id: number }>(
        connection,
        `SELECT id FROM leave_applications
          WHERE user_id = ? AND status IN ('pending','approved')
            AND start_date <= ? AND end_date >= ?
          LIMIT 1`,
        [userId, input.endDate, input.startDate]
      );
      if (overlap) {
        throw conflict('Those dates overlap an existing leave application.');
      }

      const usedRow = await queryOne<RowDataPacket & { used_days: number | string }>(
        connection,
        `SELECT COALESCE(SUM(working_days), 0) AS used_days
           FROM leave_applications
          WHERE user_id = ? AND leave_type_id = ? AND status IN ('pending','approved')
            AND start_date >= ? AND start_date < ?`,
        [userId, input.leaveTypeId, from, to]
      );
      const used = Number(usedRow?.used_days ?? 0);
      const remaining = type.yearly_entitlement - used;
      if (workingDays > remaining) {
        throw new AppError(
          400,
          'insufficient_balance',
          `Only ${Math.max(0, remaining)} working day(s) of ${type.name} remain for this year.`
        );
      }

      const inserted = await execute(
        connection,
        `INSERT INTO leave_applications
           (user_id, leave_type_id, start_date, end_date, working_days, reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
        [userId, input.leaveTypeId, input.startDate, input.endDate, workingDays, input.reason]
      );
      const id = inserted.insertId;

      if (file) {
        storedName = newStoredName(file.mime);
        await writeUpload(config.uploadDir, storedName, file.buffer);
        await execute(
          connection,
          `INSERT INTO documents
             (application_id, original_name, stored_name, mime_type, size_bytes, sha256)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            id,
            file.originalName,
            storedName,
            file.mime,
            file.buffer.length,
            sha256(file.buffer),
          ]
        );
      }

      return id;
    });

    await logActivity(pool, {
      userId,
      action: 'leave_submitted',
      targetType: 'leave_application',
      targetId: applicationId,
      ip,
    });

    return getApplication(pool, applicationId, userId, false);
  } catch (error) {
    if (storedName) await removeUpload(config.uploadDir, storedName);
    throw error;
  }
}

/**
 * One-time decision. The row (and the balance) are locked so two admins cannot
 * both decide, and approval cannot push approved days past the entitlement.
 */
export async function decideApplication(
  pool: Pool,
  adminId: number,
  applicationId: number,
  input: LeaveDecisionInput,
  ip: string | null
): Promise<LeaveApplicationDto> {
  await withTransaction(pool, async (connection) => {
    const row = await queryOne<
      RowDataPacket & {
        id: number;
        user_id: number;
        leave_type_id: number;
        start_date: string;
        end_date: string;
        working_days: number;
        status: string;
        decided_by: number | null;
        requires_document: number;
        yearly_entitlement: number;
        has_document: number;
      }
    >(
      connection,
      `SELECT la.id, la.user_id, la.leave_type_id, la.start_date, la.end_date,
              la.working_days, la.status, la.decided_by,
              lt.requires_document, lt.yearly_entitlement,
              (SELECT COUNT(*) FROM documents d WHERE d.application_id = la.id) AS has_document
         FROM leave_applications la
         JOIN leave_types lt ON lt.id = la.leave_type_id
        WHERE la.id = ?
        FOR UPDATE`,
      [applicationId]
    );

    if (!row) throw notFound();
    // Admins cannot have applications, but keep the self-decision guard
    // explicit (the schema also enforces decided_by <> user_id).
    if (row.user_id === adminId) {
      throw new AppError(403, 'forbidden', 'You cannot decide your own application.');
    }
    if (row.status !== 'pending') {
      throw conflict('This application has already been decided.');
    }

    // Serialise approvals and new submissions for the same person, so two
    // approvals cannot both consume the same remaining days.
    await queryOne<RowDataPacket>(
      connection,
      'SELECT id FROM users WHERE id = ? FOR UPDATE',
      [row.user_id]
    );

    if (input.decision === 'approved') {
      if (row.requires_document === 1 && row.has_document === 0) {
        throw conflict('This leave type needs a supporting document before it can be approved.');
      }

      const { from, to } = yearRangeOf(row.start_date);
      const approvedRow = await queryOne<RowDataPacket & { approved_days: number | string }>(
        connection,
        `SELECT COALESCE(SUM(working_days), 0) AS approved_days
           FROM leave_applications
          WHERE user_id = ? AND leave_type_id = ? AND status = 'approved'
            AND id <> ? AND start_date >= ? AND start_date < ?`,
        [row.user_id, row.leave_type_id, row.id, from, to]
      );
      const approved = Number(approvedRow?.approved_days ?? 0);
      if (approved + row.working_days > row.yearly_entitlement) {
        throw conflict('Approving this would exceed the remaining balance for that leave type.');
      }
    }

    await execute(
      connection,
      `UPDATE leave_applications
          SET status = ?, decided_by = ?, decided_at = UTC_TIMESTAMP(), remarks = ?
        WHERE id = ? AND status = 'pending'`,
      [input.decision, adminId, input.remarks ?? null, applicationId]
    );
  });

  await logActivity(pool, {
    userId: adminId,
    action: input.decision === 'approved' ? 'leave_approved' : 'leave_rejected',
    targetType: 'leave_application',
    targetId: applicationId,
    ip,
  }).catch((error: unknown) => logger.error('audit_write_failed', safeErrorFacts(error)));

  return getApplication(pool, applicationId, adminId, true);
}
