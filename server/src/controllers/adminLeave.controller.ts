import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AdminLeaveListQuery, LeaveDecisionInput } from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { normalizeIp } from '../lib/sanitize';
import { validBody, validParams, validQuery } from '../middleware/validate';
import { decideApplication, getApplication, listAllLeaves } from '../services/leave.service';

interface IdParams {
  id: number;
}

export function createAdminLeaveController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const query = validQuery<AdminLeaveListQuery>(req);
      res.status(200).json(await listAllLeaves(pool, query));
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      res.status(200).json({ application: await getApplication(pool, id, auth.userId, true) });
    },

    decide: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      const input = validBody<LeaveDecisionInput>(req);
      const application = await decideApplication(
        pool,
        auth.userId,
        id,
        input,
        normalizeIp(req.ip) ?? null
      );
      res.status(200).json({ application });
    },
  };
}
