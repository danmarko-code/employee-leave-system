import type { RequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import type { Role } from '@leave/shared';
import { forbidden, unauthorized } from '../lib/errors';
import { logger, safeErrorFacts } from '../lib/logger';
import { logActivity } from '../services/activity.service';
import { normalizeIp } from '../lib/sanitize';

/**
 * Role gate applied to every protected route. Denials are audited as
 * access_denied. The route pattern itself is not stored, only actor, action,
 * target type and time, so no query text can leak into the log.
 */
export function requireRole(allowed: readonly Role[], pool: Pool): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (!allowed.includes(req.auth.role)) {
      try {
        await logActivity(pool, {
          userId: req.auth.userId,
          action: 'access_denied',
          targetType: 'admin_route',
          ip: normalizeIp(req.ip),
        });
      } catch (error) {
        logger.error('audit_write_failed', safeErrorFacts(error));
      }
      next(forbidden());
      return;
    }
    next();
  };
}
