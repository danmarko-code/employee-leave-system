import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { LeaveTypeCreateInput, LeaveTypeUpdateInput } from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { normalizeIp } from '../lib/sanitize';
import { validBody, validParams } from '../middleware/validate';
import {
  createLeaveType,
  listLeaveTypes,
  updateLeaveType,
} from '../services/leaveType.service';

interface IdParams {
  id: number;
}

export function createAdminLeaveTypeController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    list: async (_req: Request, res: Response): Promise<void> => {
      res.status(200).json({ items: await listLeaveTypes(pool, true) });
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const input = validBody<LeaveTypeCreateInput>(req);
      const leaveType = await createLeaveType(pool, input, {
        actorId: auth.userId,
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(201).json({ leaveType });
    },

    update: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      const input = validBody<LeaveTypeUpdateInput>(req);
      const leaveType = await updateLeaveType(pool, id, input, {
        actorId: auth.userId,
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(200).json({ leaveType });
    },
  };
}
