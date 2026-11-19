import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import {
  SESSION,
  refreshTokenSchema,
  type AuthResponse,
  type LoginInput,
  type RefreshTokenInput,
} from '@leave/shared';
import { z } from 'zod';
import type { AppConfig } from '../config/env';
import { invalidInput, unauthorized } from '../lib/errors';
import { logger, safeErrorFacts } from '../lib/logger';
import { signAccessToken } from '../lib/tokens';
import { setRefreshCookie, clearRefreshCookie } from '../lib/cookies';
import { login, getMe } from '../services/auth.service';
import { logActivity } from '../services/activity.service';
import { rotateSession, revokeSessionByToken, SessionError } from '../services/session.service';
import { validBody } from '../middleware/validate';
import { normalizeIp } from '../lib/sanitize';

const logoutBodySchema = z
  .object({ refreshToken: z.string().min(32).max(256).optional() })
  .strict();

export function createAuthController(deps: { config: AppConfig; pool: Pool }) {
  const { config, pool } = deps;

  return {
    login: async (req: Request, res: Response): Promise<void> => {
      const input = validBody<LoginInput>(req);
      const clientType = req.clientType;
      if (!clientType) throw unauthorized();

      const result = await login(pool, input, clientType, normalizeIp(req.ip) ?? undefined, config);

      if (clientType === 'web') {
        setRefreshCookie(res, config, result.refreshToken);
      }

      const body: AuthResponse = {
        user: result.user,
        accessToken: result.accessToken,
        expiresIn: SESSION.accessTokenSeconds,
        sessionExpiresAt: result.sessionExpiresAt,
        ...(clientType === 'native' ? { refreshToken: result.refreshToken } : {}),
      };
      res.status(200).json(body);
    },

    /**
     * Web: reads only the httpOnly cookie and ignores any token in the body.
     * Native: reads only the body token and ignores a cookie if one is present.
     */
    refresh: async (req: Request, res: Response): Promise<void> => {
      const clientType = req.clientType;
      if (!clientType) throw unauthorized();

      let rawToken: string | undefined;
      if (clientType === 'web') {
        rawToken = (req.cookies as Record<string, string> | undefined)?.[config.cookie.name];
      } else {
        const parsed = refreshTokenSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
          throw invalidInput({ refreshToken: 'Refresh token is required.' });
        }
        rawToken = (parsed.data as RefreshTokenInput).refreshToken;
      }

      if (!rawToken) throw unauthorized();

      const rotated = await rotateSession(pool, rawToken, clientType);

      if (!rotated.ok) {
        if (rotated.reason === 'reuse' && rotated.userId) {
          await logActivity(pool, {
            userId: rotated.userId,
            action: 'session_reuse',
            targetType: 'session',
            ip: normalizeIp(req.ip),
          }).catch((auditError: unknown) => logger.error('audit_write_failed', safeErrorFacts(auditError)));
        }
        throw new SessionError(rotated.reason, rotated.userId);
      }

      const user = await getMe(pool, rotated.userId);
      if (!user) throw unauthorized();

      const accessToken = signAccessToken(config, {
        userId: rotated.userId,
        role: rotated.role,
        sessionId: rotated.sessionId,
      });

      if (clientType === 'web') {
        setRefreshCookie(res, config, rotated.token);
      }

      const body: AuthResponse = {
        user,
        accessToken,
        expiresIn: SESSION.accessTokenSeconds,
        sessionExpiresAt: rotated.sessionExpiresAt,
        ...(clientType === 'native' ? { refreshToken: rotated.token } : {}),
      };
      res.status(200).json(body);
    },

    logout: async (req: Request, res: Response): Promise<void> => {
      const auth = req.auth;
      if (!auth) throw unauthorized();
      const clientType = req.clientType;
      if (!clientType) throw unauthorized();

      let rawToken: string | undefined;
      if (clientType === 'web') {
        rawToken = (req.cookies as Record<string, string> | undefined)?.[config.cookie.name];
      } else {
        const parsed = logoutBodySchema.safeParse(req.body ?? {});
        rawToken = parsed.success ? parsed.data.refreshToken : undefined;
      }

      if (rawToken) {
        await revokeSessionByToken(pool, rawToken, auth.userId);
      }

      await logActivity(pool, {
        userId: auth.userId,
        action: 'logout',
        targetType: 'session',
        ip: normalizeIp(req.ip),
      }).catch((error: unknown) => logger.error('audit_write_failed', safeErrorFacts(error)));

      if (clientType === 'web') clearRefreshCookie(res, config);
      res.status(204).end();
    },
  };
}

