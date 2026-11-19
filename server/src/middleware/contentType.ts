import type { RequestHandler } from 'express';
import { unsupportedMedia } from '../lib/errors';

/** JSON-only routes reject form posts and every other content type outright. */
export function requireJsonBody(): RequestHandler {
  return (req, _res, next) => {
    if (req.is('application/json') !== 'application/json') {
      next(unsupportedMedia());
      return;
    }
    next();
  };
}
