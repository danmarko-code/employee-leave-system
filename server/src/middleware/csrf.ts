import type { RequestHandler } from 'express';
import type { AppConfig } from '../config/env';
import { AppError } from '../lib/errors';

const ERROR = (): AppError => new AppError(403, 'csrf_failed', 'Request blocked.');

/**
 * CSRF protection for the cookie flow, applied to login, refresh and logout.
 *
 * Native requests (X-Client: native) never send cookies and are authenticated
 * with a body token, so they are not subject to CSRF. Web requests must:
 *   1. come from an exact allow-listed Origin,
 *   2. send X-Requested-With: XMLHttpRequest (a custom header cross-site forms
 *      cannot set without CORS preflight).
 * SameSite=Strict on the cookie is the third layer.
 */
export function csrfForWeb(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    if (req.clientType !== 'web') {
      next();
      return;
    }

    const origin = req.get('origin');
    if (!origin || !config.corsOrigins.includes(origin)) {
      next(ERROR());
      return;
    }
    if (req.get('x-requested-with') !== 'XMLHttpRequest') {
      next(ERROR());
      return;
    }
    next();
  };
}

/** Refuses any plain-HTTP request when HTTPS is enforced (production). */
export function requireHttps(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    if (!config.forceHttps || req.secure) {
      next();
      return;
    }
    next(new AppError(403, 'https_required', 'HTTPS is required.'));
  };
}
