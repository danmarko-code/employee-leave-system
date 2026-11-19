import type { Pool, RowDataPacket } from 'mysql2/promise';
import type {
  AdminUserCreateInput,
  AdminUserDto,
  AdminUserListQuery,
  AdminUserUpdateInput,
  Page,
  Role,
} from '@leave/shared';
import { execute, query, queryOne } from '../db/query';
import { badRequest, conflict, notFound } from '../lib/errors';
import { hashPassword, passwordPolicyError } from '../lib/password';
import { logActivity } from './activity.service';
import { revokeAllForUser } from './session.service';

interface UserRow extends RowDataPacket {
  id: number;
  name: string;
  email: string;
  role: Role;
  position: string;
  department: string;
  phone: string | null;
  is_active: number;
  created_at: string;
}

export function toAdminDto(row: UserRow): AdminUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    position: row.position,
    department: row.department,
    phone: row.phone,
    isActive: row.is_active === 1,
    createdAt: `${row.created_at.replace(' ', 'T')}Z`,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listUsers(
  pool: Pool,
  filters: AdminUserListQuery
): Promise<Page<AdminUserDto>> {
  const role = filters.role ?? null;
  const isActive = filters.isActive === undefined ? null : filters.isActive ? 1 : 0;
  const search = filters.q ? `%${escapeLike(filters.q)}%` : null;
  const offset = (filters.page - 1) * filters.pageSize;

  const rows = await query<UserRow>(
    pool,
    `SELECT id, name, email, role, position, department, phone, is_active, created_at
       FROM users
      WHERE (? IS NULL OR role = ?)
        AND (? IS NULL OR is_active = ?)
        AND (? IS NULL OR name LIKE ? OR email LIKE ?)
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [role, role, isActive, isActive, search, search, search, filters.pageSize, offset]
  );

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    pool,
    `SELECT COUNT(*) AS total FROM users
      WHERE (? IS NULL OR role = ?)
        AND (? IS NULL OR is_active = ?)
        AND (? IS NULL OR name LIKE ? OR email LIKE ?)`,
    [role, role, isActive, isActive, search, search, search]
  );

  return {
    items: rows.map(toAdminDto),
    page: filters.page,
    pageSize: filters.pageSize,
    total: Number(totalRow?.total ?? 0),
  };
}

export async function getUser(pool: Pool, id: number): Promise<AdminUserDto> {
  const row = await queryOne<UserRow>(
    pool,
    `SELECT id, name, email, role, position, department, phone, is_active, created_at
       FROM users WHERE id = ?`,
    [id]
  );
  if (!row) throw notFound();
  return toAdminDto(row);
}

export async function createUser(
  pool: Pool,
  input: AdminUserCreateInput,
  audit: { actorId: number; ip: string | null }
): Promise<AdminUserDto> {
  const policyError = passwordPolicyError(input.password);
  if (policyError) throw badRequest(policyError);

  const hash = await hashPassword(input.password);

  let id: number;
  try {
    const result = await execute(
      pool,
      `INSERT INTO users
         (name, email, password_hash, role, position, department, phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name,
        input.email,
        hash,
        input.role,
        input.position ?? '',
        input.department ?? '',
        input.phone ?? null,
        input.isActive ? 1 : 0,
      ]
    );
    id = result.insertId;
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) {
      throw conflict('An account with that email already exists.');
    }
    throw error;
  }

  await logActivity(pool, {
    userId: audit.actorId,
    action: 'account_created',
    targetType: 'user',
    targetId: id,
    ip: audit.ip,
  });

  return getUser(pool, id);
}

export async function updateUser(
  pool: Pool,
  actorId: number,
  id: number,
  input: AdminUserUpdateInput,
  audit: { ip: string | null }
): Promise<AdminUserDto> {
  const target = await queryOne<RowDataPacket & { id: number; role: Role; is_active: number }>(
    pool,
    'SELECT id, role, is_active FROM users WHERE id = ?',
    [id]
  );
  if (!target) throw notFound();

  const has = <K extends keyof AdminUserUpdateInput>(key: K): boolean => input[key] !== undefined;
  const nextRole: Role = has('role') ? (input.role as Role) : target.role;
  const nextActive = has('isActive') ? Boolean(input.isActive) : target.is_active === 1;
  const wasActive = target.is_active === 1;

  if (id === actorId) {
    if (nextRole !== 'admin') throw badRequest('You cannot change your own role.');
    if (!nextActive) throw badRequest('You cannot deactivate your own account.');
  }

  if (target.role === 'admin' && wasActive && (nextRole !== 'admin' || !nextActive)) {
    const others = await queryOne<RowDataPacket & { count: number }>(
      pool,
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND is_active = 1 AND id <> ?",
      [id]
    );
    if (Number(others?.count ?? 0) === 0) {
      throw conflict('At least one active administrator is required.');
    }
  }

  await execute(
    pool,
    `UPDATE users
        SET name = COALESCE(?, name),
            role = COALESCE(?, role),
            position = COALESCE(?, position),
            department = COALESCE(?, department),
            phone = CASE WHEN ? = 1 THEN ? ELSE phone END,
            is_active = COALESCE(?, is_active)
      WHERE id = ?`,
    [
      has('name') ? input.name : null,
      has('role') ? input.role : null,
      has('position') ? input.position : null,
      has('department') ? input.department : null,
      has('phone') ? 1 : 0,
      has('phone') ? (input.phone ?? null) : null,
      has('isActive') ? (input.isActive ? 1 : 0) : null,
      id,
    ]
  );

  const deactivated = wasActive && !nextActive;
  if (deactivated) {
    await revokeAllForUser(pool, id);
  }

  await logActivity(pool, {
    userId: actorId,
    action: 'account_updated',
    targetType: 'user',
    targetId: id,
    ip: audit.ip,
  });

  if (has('isActive') && wasActive !== nextActive) {
    await logActivity(pool, {
      userId: actorId,
      action: 'account_activation_changed',
      targetType: 'user',
      targetId: id,
      ip: audit.ip,
    });
  }

  return getUser(pool, id);
}

export async function resetPassword(
  pool: Pool,
  actorId: number,
  id: number,
  password: string,
  audit: { ip: string | null }
): Promise<void> {
  const target = await queryOne<RowDataPacket & { id: number }>(
    pool,
    'SELECT id FROM users WHERE id = ?',
    [id]
  );
  if (!target) throw notFound();

  const policyError = passwordPolicyError(password);
  if (policyError) throw badRequest(policyError);

  const hash = await hashPassword(password);
  await execute(
    pool,
    `UPDATE users
        SET password_hash = ?, password_changed_at = UTC_TIMESTAMP(),
            failed_attempts = 0, locked_until = NULL
      WHERE id = ?`,
    [hash, id]
  );

  // A reset signs the person out everywhere.
  await revokeAllForUser(pool, id);

  await logActivity(pool, {
    userId: actorId,
    action: 'password_reset',
    targetType: 'user',
    targetId: id,
    ip: audit.ip,
  });
}
