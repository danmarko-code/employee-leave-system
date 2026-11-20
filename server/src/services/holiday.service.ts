import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { HolidayDto } from '@leave/shared';
import { execute, query, queryOne } from '../db/query';
import { conflict, notFound } from '../lib/errors';
import { logActivity } from './activity.service';

interface HolidayRow extends RowDataPacket {
  id: number;
  name: string;
  date: string;
  is_active: number;
}

function toDto(row: HolidayRow): HolidayDto {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    isActive: row.is_active === 1,
  };
}

export async function listHolidays(pool: Pool): Promise<HolidayDto[]> {
  const rows = await query<HolidayRow>(
    pool,
    `SELECT id, name, date, is_active
       FROM holidays
      ORDER BY date ASC`
  );
  return rows.map(toDto);
}

export async function createHoliday(
  pool: Pool,
  name: string,
  date: string,
  audit: { actorId: number; ip: string | null }
): Promise<HolidayDto> {
  let insertId: number;
  try {
    const result = await execute(
      pool,
      `INSERT INTO holidays (name, date) VALUES (?, ?)`,
      [name, date]
    );
    insertId = result.insertId;
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) {
      throw conflict('A holiday for that date already exists.');
    }
    throw error;
  }

  await logActivity(pool, {
    userId: audit.actorId,
    action: 'holiday_created',
    targetType: 'holiday',
    targetId: insertId,
    ip: audit.ip,
  });

  const row = await queryOne<HolidayRow>(
    pool,
    'SELECT id, name, date, is_active FROM holidays WHERE id = ?',
    [insertId]
  );
  if (!row) throw notFound();
  return toDto(row);
}

export async function deleteHoliday(
  pool: Pool,
  id: number,
  audit: { actorId: number; ip: string | null }
): Promise<void> {
  const result = await execute(pool, 'DELETE FROM holidays WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw notFound();

  await logActivity(pool, {
    userId: audit.actorId,
    action: 'holiday_deleted',
    targetType: 'holiday',
    targetId: id,
    ip: audit.ip,
  });
}