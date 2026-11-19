import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ROLES, SESSION, type Role } from '@leave/shared';
import type { AppConfig } from '../config/env';
import { unauthorized } from './errors';

const ACCESS_PAYLOAD = z.object({
  sub: z.string().regex(/^\d+$/),
  role: z.enum(ROLES),
  sid: z.string().uuid(),
  iss: z.string(),
  aud: z.string(),
  iat: z.number(),
  exp: z.number(),
});

export interface AccessTokenClaims {
  userId: number;
  role: Role;
  sessionId: string;
}

export function signAccessToken(
  config: AppConfig,
  claims: { userId: number; role: Role; sessionId: string }
): string {
  return jwt.sign({ role: claims.role, sid: claims.sessionId }, config.jwt.accessSecret, {
    algorithm: 'HS256',
    subject: String(claims.userId),
    issuer: config.jwt.issuer,
    audience: config.jwt.audience,
    expiresIn: SESSION.accessTokenSeconds,
  });
}

/**
 * Fixed algorithm, explicit allow-list (rejects "none"), and issuer/audience/
 * expiry checks. Any failure becomes the same generic 401.
 */
export function verifyAccessToken(config: AppConfig, token: string): AccessTokenClaims {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, config.jwt.accessSecret, {
      algorithms: ['HS256'],
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      clockTolerance: 5,
    });
  } catch {
    throw unauthorized();
  }

  const parsed = ACCESS_PAYLOAD.safeParse(decoded);
  if (!parsed.success) throw unauthorized();

  return {
    userId: Number(parsed.data.sub),
    role: parsed.data.role,
    sessionId: parsed.data.sid,
  };
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 256 bits of randomness, base64url encoded (43 characters). */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256Hex(token) };
}

/** Opaque session/family identifier put in the JWT's sid claim. */
export function newSessionId(): string {
  return randomUUID();
}
