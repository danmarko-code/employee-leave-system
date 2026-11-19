import type { RowDataPacket } from 'mysql2';
import type { ActivityAction, ActivityLogPage } from '@leave/shared';
import type { DbExecutor } from '../db/pool';
import { execute, query, queryOne } from '../db/query';
import { normalizeIp, sanitizeLogValue } from '../lib/sanitize';

export interface ActivityEntry {
  userId: number | null;
  action: ActivityAction;
  targetType?: string | null;
  targetId?: number | null;
  ip?: string | null;
}

/**
 * Append-only audit write. Callers must never pass emails, reasons, passwords,
 * tokens or any free-form user text. Values are still sanitized so control
 * characters cannot forge log lines.
 */
export async function logActivity(db: DbExecutor, entry: ActivityEntry): Promise<void> {
  await execute(
    db,
    `INSERT INTO activity_logs (user_id, action, target_type, target_id, ip_address)
     VALUES (?, ?, ?, ?, ?)`,
    [
      entry.userId,
      sanitizeLogValue(entry.action, 64),
      entry.targetType ? sanitizeLogValue(entry.targetType, 40) : null,
      entry.targetId ?? null,
      normalizeIp(entry.ip ?? undefined),
    ]
  );
}

interface ActivityRow extends RowDataPacket {
  id: number;
  action: string;
  target_type: string | null;
  target_id: number | null;
  ip_address: string | null;
  created_at: string;
  actor_name: string | null;
}

export interface ActivityFilters {
  page: number;
  pageSize: number;
  action?: string;
  userId?: number;
  from?: Date;
  to?: Date;
}

/**
 * Admin-only listing. Filters are bound parameters against one constant SQL
 * statement (the nullable-parameter pattern), so no dynamic SQL is built.
 */
export async function listActivityLogs(db: DbExecutor, filters: ActivityFilters): Promise<ActivityLogPage> {
  const action = filters.action ?? null;
  const userId = filters.userId ?? null;
  const from = filters.from ?? null;
  const to = filters.to ?? null;
  const offset = (filters.page - 1) * filters.pageSize;

  const items = await query<ActivityRow>(
    db,
    `SELECT al.id, al.action, al.target_type, al.target_id, al.ip_address, al.created_at,
            u.name AS actor_name
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
      WHERE (? IS NULL OR al.action = ?)
        AND (? IS NULL OR al.user_id = ?)
        AND (? IS NULL OR al.created_at >= ?)
        AND (? IS NULL OR al.created_at < ?)
      ORDER BY al.id DESC
      LIMIT ? OFFSET ?`,
    [action, action, userId, userId, from, from, to, to, filters.pageSize, offset]
  );

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    db,
    `SELECT COUNT(*) AS total
       FROM activity_logs al
      WHERE (? IS NULL OR al.action = ?)
        AND (? IS NULL OR al.user_id = ?)
        AND (? IS NULL OR al.created_at >= ?)
        AND (? IS NULL OR al.created_at < ?)`,
    [action, action, userId, userId, from, from, to, to]
  );

  return {
    items: items.map((row) => ({
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      actorName: row.actor_name,
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(totalRow?.total ?? 0),
  };
}
