import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { ClientType, Role, UserDto } from '@leave/shared';
import type { AppConfig } from '../config/env';
import { execute, queryOne } from '../db/query';
import { invalidCredentials } from '../lib/errors';
import { logger, safeErrorFacts } from '../lib/logger';
import { verifyDummyPassword, verifyPassword } from '../lib/password';
import { signAccessToken } from '../lib/tokens';
import { logActivity } from './activity.service';
import { createSession, sessionExpiresAt } from './session.service';

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: Role;
  position: string;
  department: string;
  phone: string | null;
  password_hash: string;
  is_active: number;
  is_locked: number;
}

export interface LoginResult {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
  sessionExpiresAt: string;
}

export function toUserDto(row: {
  id: number;
  name: string;
  email: string;
  role: Role;
  position: string;
  department: string;
  phone: string | null;
}): UserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    position: row.position,
    department: row.department,
    phone: row.phone,
  };
}

async function audit(db: Pool, entry: Parameters<typeof logActivity>[1]): Promise<void> {
  try {
    await logActivity(db, entry);
  } catch (error) {
    // Audit failure must not turn into an auth bypass or a crash, but it is
    // recorded server-side. The DB being down will fail login anyway.
    logger.error('audit_write_failed', safeErrorFacts(error));
  }
}

/** Atomic per-account counter with a 15-minute lock after five failures. */
async function registerFailedAttempt(pool: Pool, userId: number): Promise<void> {
  await execute(
    pool,
    `UPDATE users
        SET locked_until = CASE
              WHEN failed_attempts + 1 >= 5 THEN UTC_TIMESTAMP() + INTERVAL 15 MINUTE
              ELSE locked_until
            END,
            failed_attempts = CASE
              WHEN failed_attempts + 1 >= 5 THEN 0
              ELSE failed_attempts + 1
            END
      WHERE id = ?
        AND (locked_until IS NULL OR locked_until <= UTC_TIMESTAMP())`,
    [userId]
  );
}

/**
 * Sign in. The response is identical for an unknown email, a wrong password,
 * a locked account and a deactivated account: one generic 401. Argon2 still
 * runs for unknown emails so response time does not reveal account existence.
 */
export async function login(
  pool: Pool,
  input: { email: string; password: string },
  clientType: ClientType,
  ip: string | undefined,
  config: AppConfig
): Promise<LoginResult> {
  const user = await queryOne<UserRow>(
    pool,
    `SELECT id, name, email, role, position, department, phone, password_hash, is_active,
            (locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP()) AS is_locked
       FROM users
      WHERE email = ?
      LIMIT 1`,
    [input.email]
  );

  if (!user) {
    await verifyDummyPassword(input.password);
    await audit(pool, { userId: null, action: 'login_failure', ip });
    throw invalidCredentials();
  }

  const passwordOk = await verifyPassword(user.password_hash, input.password);

  if (!passwordOk) {
    if (!user.is_locked) await registerFailedAttempt(pool, user.id);
    await audit(pool, { userId: user.id, action: 'login_failure', ip });
    throw invalidCredentials();
  }

  if (user.is_locked || !user.is_active) {
    await audit(pool, { userId: user.id, action: 'login_failure', ip });
    throw invalidCredentials();
  }

  await execute(
    pool,
    'UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?',
    [user.id]
  );

  const session = await createSession(pool, user.id, clientType);
  const accessToken = signAccessToken(config, {
    userId: user.id,
    role: user.role,
    sessionId: session.sessionId,
  });

  await audit(pool, { userId: user.id, action: 'login_success', ip });

  return {
    user: toUserDto(user),
    accessToken,
    refreshToken: session.token,
    sessionExpiresAt: sessionExpiresAt(),
  };
}

export async function getMe(pool: Pool, userId: number): Promise<UserDto | null> {
  const row = await queryOne<UserRow>(
    pool,
    `SELECT id, name, email, role, position, department, phone, password_hash, is_active, 0 AS is_locked
       FROM users
      WHERE id = ? AND is_active = 1
      LIMIT 1`,
    [userId]
  );
  return row ? toUserDto(row) : null;
}

export async function updatePhone(
  pool: Pool,
  userId: number,
  phone: string | null,
  ip: string | undefined
): Promise<UserDto | null> {
  await execute(pool, 'UPDATE users SET phone = ? WHERE id = ? AND is_active = 1', [phone, userId]);
  const user = await getMe(pool, userId);
  if (user) {
    await logActivity(pool, { userId, action: 'profile_update', targetType: 'user', targetId: userId, ip }).catch(
      (error: unknown) => logger.error('audit_write_failed', safeErrorFacts(error))
    );
  }
  return user;
}
