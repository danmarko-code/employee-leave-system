import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  LeaveBalanceDto,
  LeaveTypeCreateInput,
  LeaveTypeDto,
  LeaveTypeUpdateInput,
} from '@leave/shared';
import { execute, query, queryOne } from '../db/query';
import { conflict, notFound } from '../lib/errors';
import { logActivity } from './activity.service';

interface LeaveTypeRow extends RowDataPacket {
  id: number;
  name: string;
  yearly_entitlement: number;
  requires_document: number;
  is_active: number;
}

interface BalanceRow extends LeaveTypeRow {
  approved_days: number | string;
  pending_days: number | string;
}

function toDto(row: LeaveTypeRow): LeaveTypeDto {
  return {
    id: row.id,
    name: row.name,
    yearlyEntitlement: row.yearly_entitlement,
    requiresDocument: row.requires_document === 1,
    isActive: row.is_active === 1,
  };
}

export async function listLeaveTypes(pool: Pool, includeInactive: boolean): Promise<LeaveTypeDto[]> {
  const rows = await query<LeaveTypeRow>(
    pool,
    `SELECT id, name, yearly_entitlement, requires_document, is_active
       FROM leave_types
      WHERE (? = 1 OR is_active = 1)
      ORDER BY is_active DESC, name ASC`,
    [includeInactive ? 1 : 0]
  );
  return rows.map(toDto);
}

/**
 * Per-type balance for one person and one calendar year. Approved and pending
 * days are both counted against the entitlement so an employee cannot queue
 * more leave than they have.
 */
export async function listBalances(
  pool: Pool,
  userId: number,
  year: number,
  includeInactive = false
): Promise<LeaveBalanceDto[]> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;

  const rows = await query<BalanceRow>(
    pool,
    `SELECT lt.id, lt.name, lt.yearly_entitlement, lt.requires_document, lt.is_active,
            COALESCE(SUM(CASE WHEN la.status = 'approved' THEN la.working_days ELSE 0 END), 0) AS approved_days,
            COALESCE(SUM(CASE WHEN la.status = 'pending'  THEN la.working_days ELSE 0 END), 0) AS pending_days
       FROM leave_types lt
       LEFT JOIN leave_applications la
         ON la.leave_type_id = lt.id
        AND la.user_id = ?
        AND la.start_date >= ?
        AND la.start_date < ?
      WHERE (? = 1 OR lt.is_active = 1)
      GROUP BY lt.id, lt.name, lt.yearly_entitlement, lt.requires_document, lt.is_active
      ORDER BY lt.is_active DESC, lt.name ASC`,
    [userId, from, to, includeInactive ? 1 : 0]
  );

  return rows.map((row) => {
    const approvedDays = Number(row.approved_days);
    const pendingDays = Number(row.pending_days);
    return {
      ...toDto(row),
      year,
      approvedDays,
      pendingDays,
      remainingDays: Math.max(0, row.yearly_entitlement - approvedDays - pendingDays),
    };
  });
}

export async function createLeaveType(
  pool: Pool,
  input: LeaveTypeCreateInput,
  audit: { actorId: number; ip: string | null }
): Promise<LeaveTypeDto> {
  let insertId: number;
  try {
    const result = await execute(
      pool,
      `INSERT INTO leave_types (name, yearly_entitlement, requires_document, is_active)
       VALUES (?, ?, ?, ?)`,
      [input.name, input.yearlyEntitlement, input.requiresDocument ? 1 : 0, input.isActive ? 1 : 0]
    );
    insertId = result.insertId;
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) {
      throw conflict('A leave type with that name already exists.');
    }
    throw error;
  }

  await logActivity(pool, {
    userId: audit.actorId,
    action: 'leave_type_changed',
    targetType: 'leave_type',
    targetId: insertId,
    ip: audit.ip,
  });

  const row = await queryOne<LeaveTypeRow>(
    pool,
    'SELECT id, name, yearly_entitlement, requires_document, is_active FROM leave_types WHERE id = ?',
    [insertId]
  );
  if (!row) throw notFound();
  return toDto(row);
}

export async function updateLeaveType(
  pool: Pool,
  id: number,
  input: LeaveTypeUpdateInput,
  audit: { actorId: number; ip: string | null }
): Promise<LeaveTypeDto> {
  const has = <K extends keyof LeaveTypeUpdateInput>(key: K): boolean => input[key] !== undefined;

  try {
    const result = await execute(
      pool,
      `UPDATE leave_types
          SET name = COALESCE(?, name),
              yearly_entitlement = COALESCE(?, yearly_entitlement),
              requires_document = COALESCE(?, requires_document),
              is_active = COALESCE(?, is_active)
        WHERE id = ?`,
      [
        has('name') ? input.name : null,
        has('yearlyEntitlement') ? input.yearlyEntitlement : null,
        has('requiresDocument') ? (input.requiresDocument ? 1 : 0) : null,
        has('isActive') ? (input.isActive ? 1 : 0) : null,
        id,
      ]
    );
    if (result.affectedRows === 0) throw notFound();
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) {
      throw conflict('A leave type with that name already exists.');
    }
    throw error;
  }

  await logActivity(pool, {
    userId: audit.actorId,
    action: 'leave_type_changed',
    targetType: 'leave_type',
    targetId: id,
    ip: audit.ip,
  });

  const row = await queryOne<LeaveTypeRow>(
    pool,
    'SELECT id, name, yearly_entitlement, requires_document, is_active FROM leave_types WHERE id = ?',
    [id]
  );
  if (!row) throw notFound();
  return toDto(row);
}
