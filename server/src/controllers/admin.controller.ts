import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { ActivityQuery } from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { normalizeIp } from '../lib/sanitize';
import { validQuery } from '../middleware/validate';
import { listActivityLogs } from '../services/activity.service';

const ACTIVITY_CSV_COLUMNS: Array<[string, (row: any) => string]> = [
  ['ID', (row) => String(row.id)],
  ['Created at', (row) => row.createdAt],
  ['Actor', (row) => row.actorName ?? 'System'],
  ['Action', (row) => row.action],
  ['Target type', (row) => row.targetType ?? ''],
  ['Target id', (row) => row.targetId ?? ''],
  ['IP address', (row) => row.ipAddress ?? ''],
];

function csvCell(value: string): string {
  let text = value.replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@\t]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function createAdminController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    activityLogs: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const query = validQuery<ActivityQuery>(req);

      if (query.format === 'csv') {
        const page = await listActivityLogs(pool, {
          page: 1,
          pageSize: 10000,
          action: query.action,
          userId: query.userId,
          from: query.from ? new Date(query.from) : undefined,
          to: query.to ? new Date(query.to) : undefined,
        });

        const header = ACTIVITY_CSV_COLUMNS.map(([label]) => csvCell(label)).join(',');
        const body = page.items.map((row) =>
          ACTIVITY_CSV_COLUMNS.map(([, get]) => csvCell(get(row))).join(',')
        );
        const stamp = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="activity-${stamp}.csv"`);
        res.status(200).send([header, ...body].join('\r\n'));
        return;
      }

      const page = await listActivityLogs(pool, {
        page: query.page,
        pageSize: query.pageSize,
        action: query.action,
        userId: query.userId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      });
      res.status(200).json(page);
    },
  };
}