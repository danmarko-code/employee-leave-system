import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import {
  DOCUMENT_MIME_TYPES,
  type BalanceQuery,
  type LeaveCreateInput,
  type LeaveListQuery,
} from '@leave/shared';
import type { AppConfig } from '../config/env';
import { invalidInput, notFound, unauthorized } from '../lib/errors';
import { normalizeIp } from '../lib/sanitize';
import { currentYearUtc } from '../lib/dates';
import { contentDisposition, sanitizeOriginalName, sniffMime } from '../lib/files';
import { validBody, validParams, validQuery } from '../middleware/validate';
import { listBalances, listLeaveTypes } from '../services/leaveType.service';
import {
  createApplication,
  getApplication,
  getDocumentForViewer,
  listMyLeaves,
} from '../services/leave.service';

interface IdParams {
  id: number;
}

export function createLeaveController(deps: { config: AppConfig; pool: Pool }) {
  const { config, pool } = deps;

  return {
    types: async (_req: Request, res: Response): Promise<void> => {
      res.status(200).json({ items: await listLeaveTypes(pool, false) });
    },

    balances: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const query = validQuery<BalanceQuery>(req);
      const year = query.year ?? currentYearUtc();
      res.status(200).json({ items: await listBalances(pool, auth.userId, year) });
    },

    list: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const query = validQuery<LeaveListQuery>(req);
      res.status(200).json(await listMyLeaves(pool, auth.userId, query));
    },

    get: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);
      res.status(200).json({ application: await getApplication(pool, id, auth.userId, auth.role === 'admin') });
    },

    create: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const input = validBody<LeaveCreateInput>(req);

      let file: { buffer: Buffer; mime: 'application/pdf' | 'image/jpeg' | 'image/png'; originalName: string } | null =
        null;

      if (req.file) {
        if (req.file.buffer.length === 0) {
          throw invalidInput({ document: 'The attached file is empty.' });
        }
        const detected = sniffMime(req.file.buffer);
        if (!detected) {
          throw invalidInput({ document: 'Attach a PDF, JPEG or PNG file.' });
        }
        const declared = req.file.mimetype;
        const isKnown = (DOCUMENT_MIME_TYPES as readonly string[]).includes(declared);
        if (isKnown && declared !== detected) {
          throw invalidInput({ document: 'The file content does not match its type.' });
        }
        file = {
          buffer: req.file.buffer,
          mime: detected,
          originalName: sanitizeOriginalName(req.file.originalname),
        };
      }

      const application = await createApplication(
        pool,
        { uploadDir: config.uploadDir },
        auth.userId,
        input,
        file,
        normalizeIp(req.ip) ?? null
      );
      res.status(201).json({ application });
    },

    document: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const { id } = validParams<IdParams>(req);

      const doc = await getDocumentForViewer(
        pool,
        id,
        auth.userId,
        auth.role === 'admin',
        config.uploadDir
      );

      res.setHeader('Content-Type', doc.mimeType);
      res.setHeader('Content-Length', String(doc.sizeBytes));
      res.setHeader('Content-Disposition', contentDisposition(doc.originalName));
      res.setHeader('X-Content-Type-Options', 'nosniff');

      res.sendFile(doc.absolutePath, (error) => {
        if (!error) return;
        if (res.headersSent) return;
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          next(notFound());
          return;
        }
        next(error);
      });
    },
  };
}
