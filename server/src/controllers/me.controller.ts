import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { UpdateProfileInput } from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { getMe, updatePhone } from '../services/auth.service';
import { validBody } from '../middleware/validate';
import { normalizeIp } from '../lib/sanitize';

export function createMeController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    get: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const user = await getMe(pool, auth.userId);
      if (!user) throw unauthorized();
      res.status(200).json({ user });
    },

    update: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const input = validBody<UpdateProfileInput>(req);
      const user = await updatePhone(pool, auth.userId, input.phone, normalizeIp(req.ip) ?? undefined);
      if (!user) throw unauthorized();
      res.status(200).json({ user });
    },
  };
}
