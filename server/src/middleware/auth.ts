import type { RequestHandler } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import { logger, safeErrorFacts } from '../lib/logger';
import { unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import { loadSessionState, revokeFamily } from '../services/session.service';

/**
 * Verifies the access JWT, then re-reads the user and session from the database
 * on every request:
 *  - deactivated users are refused even with an unexpired token,
 *  - the role comes from the database, not from the token,
 *  - revoked sessions (logout, password reset, admin deactivation) are refused,
 *  - the 30-minute idle and 12-hour absolute limits are enforced here too.
 */
export function requireAuth(config: AppConfig, pool: Pool): RequestHandler {
  return async (req, _res, next) => {
    try {
      const header = req.get('authorization') ?? '';
      const [scheme, token, extra] = header.split(' ');
      if (scheme !== 'Bearer' || !token || extra) throw unauthorized();

      const claims = verifyAccessToken(config, token);
      const session = await loadSessionState(pool, claims.userId, claims.sessionId);

      if (!session || session.is_active !== 1) throw unauthorized();

      if (session.idle_expired || session.absolute_expired) {
        await revokeFamily(pool, claims.sessionId).catch((error: unknown) =>
          logger.error('session_revoke_failed', safeErrorFacts(error))
        );
        throw unauthorized();
      }

      req.auth = {
        userId: session.user_id,
        role: session.role,
        sessionId: claims.sessionId,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}
