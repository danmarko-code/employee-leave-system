import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type {
  AdminPasswordResetInput,
  AdminUserCreateInput,
  AdminUserListQuery,
  AdminUserUpdateInput,
} from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { normalizeIp } from '../lib/sanitize';
import { validBody, validParams, validQuery } from '../middleware/validate';
import {
  createUser,
  listUsers,
  resetPassword,
  updateUser,
} from '../services/userAdmin.service';

interface IdParams {
  id: number;
}

export function createAdminUserController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    list: async (req: Request, res: Response): Promise<void> => {
      const query = validQuery<AdminUserListQuery>(req);
      res.status(200).json(await listUsers(pool, query));
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const input = validBody<AdminUserCreateInput>(req);
      const user = await createUser(pool, input, {
        actorId: auth.userId,
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(201).json({ user });
    },

    update: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      const input = validBody<AdminUserUpdateInput>(req);
      const user = await updateUser(pool, auth.userId, id, input, {
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(200).json({ user });
    },

    resetPassword: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      const input = validBody<AdminPasswordResetInput>(req);
      await resetPassword(pool, auth.userId, id, input.password, {
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(204).end();
    },
  };
}
