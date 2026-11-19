import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { ClientType, Role } from '@leave/shared';
import { AppError } from '../lib/errors';
import { generateRefreshToken, newSessionId, sha256Hex } from '../lib/tokens';
import { execute, queryOne, withTransaction } from '../db/query';

export type SessionFailure =
  | 'invalid'
  | 'reuse'
  | 'client_mismatch'
  | 'inactive'
  | 'idle'
  | 'expired';

export class SessionError extends AppError {
  readonly reason: SessionFailure;
  readonly userId: number | null;

  constructor(reason: SessionFailure, userId: number | null = null) {
    super(401, 'session_expired', 'Sign in again to continue.');
    this.reason = reason;
    this.userId = userId;
  }
}

interface LockedTokenRow extends RowDataPacket {
  id: number;
  user_id: number;
  family_id: string;
  client_type: ClientType;
  revoked_at: string | null;
  session_started_at: string;
  idle_expired: number;
  absolute_expired: number;
  is_active: number;
  role: Role;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
}

export interface RotatedSession extends CreatedSession {
  userId: number;
  role: Role;
  sessionExpiresAt: string;
}

/**
 * Rotation returns its refusals instead of throwing so that any revocation the
 * transaction performed (family-wide theft response, dead session) is COMMITTED
 * before the caller turns the result into a 401. Throwing inside the
 * transaction would roll the revocation back.
 */
export type RotateResult =
  | ({ ok: true } & RotatedSession)
  | { ok: false; reason: SessionFailure; userId: number | null };

export async function createSession(pool: Pool, userId: number, clientType: ClientType): Promise<CreatedSession> {
  const sessionId = newSessionId();
  const { token, hash } = generateRefreshToken();

  await execute(
    pool,
    `INSERT INTO refresh_tokens
       (user_id, token_hash, family_id, client_type, session_started_at, created_at, last_used_at, expires_at)
     VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL 12 HOUR)`,
    [userId, hash, sessionId, clientType]
  );

  return { token, sessionId };
}

/**
 * Rotates a refresh token inside one transaction with a row lock:
 *  - a revoked token whose family still has an active token means the token was
 *    rotated and is being replayed: revoke the whole family (theft detection),
 *  - a client that does not match the token's registered client is refused,
 *  - 30 minutes idle or 12 hours absolute ends the session,
 *  - deactivated users end the session.
 * Exactly one concurrent caller can rotate a given token.
 */
export async function rotateSession(
  pool: Pool,
  rawToken: string,
  clientType: ClientType
): Promise<RotateResult> {
  const hash = sha256Hex(rawToken);

  return withTransaction(pool, async (connection) => {
    const row = await queryOne<LockedTokenRow>(
      connection,
      `SELECT rt.id, rt.user_id, rt.family_id, rt.client_type, rt.revoked_at,
              rt.session_started_at,
              (rt.last_used_at < UTC_TIMESTAMP() - INTERVAL 30 MINUTE) AS idle_expired,
              (rt.session_started_at < UTC_TIMESTAMP() - INTERVAL 12 HOUR) AS absolute_expired,
              u.is_active, u.role
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = ?
        FOR UPDATE`,
      [hash]
    );

    if (!row) return { ok: false, reason: 'invalid', userId: null };

    if (row.revoked_at) {
      const active = await queryOne<RowDataPacket & { active_count: number }>(
        connection,
        'SELECT COUNT(*) AS active_count FROM refresh_tokens WHERE family_id = ? AND revoked_at IS NULL',
        [row.family_id]
      );
      if (Number(active?.active_count ?? 0) > 0) {
        await revokeFamily(connection, row.family_id);
        return { ok: false, reason: 'reuse', userId: row.user_id };
      }
      return { ok: false, reason: 'invalid', userId: row.user_id };
    }

    if (row.client_type !== clientType) {
      return { ok: false, reason: 'client_mismatch', userId: row.user_id };
    }

    if (!row.is_active) {
      await revokeFamily(connection, row.family_id);
      return { ok: false, reason: 'inactive', userId: row.user_id };
    }

    if (row.idle_expired || row.absolute_expired) {
      await revokeFamily(connection, row.family_id);
      return { ok: false, reason: row.idle_expired ? 'idle' : 'expired', userId: row.user_id };
    }

    await execute(
      connection,
      'UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP(), last_used_at = UTC_TIMESTAMP() WHERE id = ? AND revoked_at IS NULL',
      [row.id]
    );

    const next = generateRefreshToken();
    await execute(
      connection,
      `INSERT INTO refresh_tokens
         (user_id, token_hash, family_id, client_type, session_started_at, created_at, last_used_at, expires_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), DATE_ADD(?, INTERVAL 12 HOUR))`,
      [row.user_id, next.hash, row.family_id, row.client_type, row.session_started_at, row.session_started_at]
    );

    return {
      ok: true,
      token: next.token,
      sessionId: row.family_id,
      userId: row.user_id,
      role: row.role,
      sessionExpiresAt: new Date(sqlUtcToMs(row.session_started_at) + 12 * 60 * 60 * 1000).toISOString(),
    };
  });
}

export async function revokeFamily(db: Pool | PoolConnection, familyId: string): Promise<void> {
  await execute(
    db,
    'UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE family_id = ? AND revoked_at IS NULL',
    [familyId]
  );
}

/**
 * Logout: revoke the whole family so no rotated ancestor can be replayed.
 * If the token is unknown or belongs to someone else, nothing happens and the
 * caller still gets a success response (no token oracle).
 */
export async function revokeSessionByToken(pool: Pool, rawToken: string, userId: number): Promise<void> {
  const family = await queryOne<RowDataPacket & { family_id: string }>(
    pool,
    'SELECT family_id FROM refresh_tokens WHERE token_hash = ? AND user_id = ? LIMIT 1',
    [sha256Hex(rawToken), userId]
  );
  if (!family) return;
  await revokeFamily(pool, family.family_id);
}

export async function revokeAllForUser(pool: Pool, userId: number): Promise<void> {
  await execute(
    pool,
    'UPDATE refresh_tokens SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL',
    [userId]
  );
}

/** Access-token middleware helper: is this session still alive? */
export interface SessionStateRow extends RowDataPacket {
  user_id: number;
  role: Role;
  is_active: number;
  family_id: string;
  idle_expired: number;
  absolute_expired: number;
}

export async function loadSessionState(
  pool: Pool,
  userId: number,
  sessionId: string
): Promise<SessionStateRow | null> {
  return queryOne<SessionStateRow>(
    pool,
    `SELECT u.id AS user_id, u.role, u.is_active, rt.family_id,
            (rt.last_used_at < UTC_TIMESTAMP() - INTERVAL 30 MINUTE) AS idle_expired,
            (rt.session_started_at < UTC_TIMESTAMP() - INTERVAL 12 HOUR) AS absolute_expired
       FROM users u
       JOIN refresh_tokens rt ON rt.user_id = u.id
      WHERE u.id = ? AND rt.family_id = ? AND rt.revoked_at IS NULL
      ORDER BY rt.id DESC
      LIMIT 1`,
    [userId, sessionId]
  );
}

function sqlUtcToMs(value: string): number {
  return new Date(`${value.replace(' ', 'T')}Z`).getTime();
}

export function sessionExpiresAt(): string {
  return new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
}
