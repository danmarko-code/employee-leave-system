import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import type { AppConfig } from '../config/env';
import { forbidden, invalidInput, notFound, unauthorized } from '../lib/errors';
import { sniffImageMime } from '../lib/files';
import { normalizeIp } from '../lib/sanitize';
import { logActivity } from '../services/activity.service';
import { clearPhoto, findPhoto, storePhoto, userExists } from '../services/photo.service';
import { validParams, validQuery } from '../middleware/validate';

export const photoQuerySchema = z.strictObject({
  size: z.enum(['full', 'thumb']).default('full'),
});

type PhotoQuery = z.infer<typeof photoQuerySchema>;
interface IdParams {
  id: number;
}

export function createPhotoController(deps: { config: AppConfig; pool: Pool }) {
  const { config, pool } = deps;

  const audit = async (actorId: number, targetId: number, ip: string | undefined) => {
    await logActivity(pool, {
      userId: actorId,
      action: 'profile_update',
      targetType: 'user',
      targetId,
      ip: normalizeIp(ip) ?? undefined,
    }).catch(() => undefined);
  };

  return {
    upload: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      if (!req.file || req.file.buffer.length === 0) {
        throw invalidInput({ photo: 'Choose an image to upload.' });
      }
      if (!sniffImageMime(req.file.buffer)) {
        throw invalidInput({ photo: 'Use a JPEG, PNG or WebP image.' });
      }

      try {
        await storePhoto(pool, config.uploadDir, auth.userId, req.file.buffer);
      } catch {
        // Decode failures are the client's problem, not a server fault.
        throw invalidInput({ photo: 'That image could not be read. Try another one.' });
      }

      await audit(auth.userId, auth.userId, req.ip);
      res.status(200).json({ hasPhoto: true });
    },

    removeOwn: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const removed = await clearPhoto(pool, config.uploadDir, auth.userId);
      if (removed) await audit(auth.userId, auth.userId, req.ip);
      res.status(204).end();
    },

    removeForUser: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      if (!(await userExists(pool, id))) throw notFound();
      const removed = await clearPhoto(pool, config.uploadDir, id);
      if (removed) await audit(auth.userId, id, req.ip);
      res.status(204).end();
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      const { size } = validQuery<PhotoQuery>(req);

      if (auth.role !== 'admin' && auth.userId !== id) throw forbidden();

      const location = await findPhoto(pool, config.uploadDir, id, size);
      if (!location) throw notFound();

      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Content-Length', String(location.size));
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline; filename="photo.webp"');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
      res.status(200);
      createReadStream(location.path).pipe(res);
    },
  };
}
