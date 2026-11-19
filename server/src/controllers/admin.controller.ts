import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { ActivityQuery } from '@leave/shared';
import { listActivityLogs } from '../services/activity.service';
import { validQuery } from '../middleware/validate';

export function createAdminController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    activityLogs: async (req: Request, res: Response): Promise<void> => {
      const query = validQuery<ActivityQuery>(req);
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
