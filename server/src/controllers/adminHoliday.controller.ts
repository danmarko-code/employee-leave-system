import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import type { HolidayCreateInput } from '@leave/shared';
import { unauthorized } from '../lib/errors';
import { normalizeIp } from '../lib/sanitize';
import { validBody } from '../middleware/validate';
import { createHoliday, deleteHoliday, listHolidays } from '../services/holiday.service';

export function createHolidayController(deps: { pool: Pool }) {
  const { pool } = deps;

  return {
    list: async (_req: Request, res: Response): Promise<void> => {
      const holidays = await listHolidays(pool);
      res.status(200).json({ items: holidays });
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const id = Number(req.params.id);
      const holidays = await listHolidays(pool);
      const holiday = holidays.find((h) => h.id === id);
      if (!holiday) {
        res.status(404).json({ error: { code: 'not_found', message: 'Holiday not found' } });
        return;
      }
      res.status(200).json(holiday);
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const body = validBody<HolidayCreateInput>(req);
      const holiday = await createHoliday(pool, body.name, body.date, {
        actorId: auth.userId,
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(201).json(holiday);
    },

    delete: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const id = Number(req.params.id);
      await deleteHoliday(pool, id, {
        actorId: auth.userId,
        ip: normalizeIp(req.ip) ?? null,
      });
      res.status(204).send();
    },
  };
}