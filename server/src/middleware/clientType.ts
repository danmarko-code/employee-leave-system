import type { RequestHandler } from 'express';
import { CLIENT_TYPES, type ClientType } from '@leave/shared';
import { AppError } from '../lib/errors';

/**
 * Auth endpoints require an explicit X-Client header so the server can enforce
 * the correct token flow. Web clients use an httpOnly cookie; native clients
 * use a token in the response body and Authorization header.
 */
export function requireClientType(): RequestHandler {
  return (req, _res, next) => {
    const header = req.get('x-client');
    if (!header || !(CLIENT_TYPES as readonly string[]).includes(header)) {
      next(new AppError(400, 'invalid_client', 'X-Client must be "web" or "native".'));
      return;
    }
    req.clientType = header as ClientType;
    next();
  };
}

