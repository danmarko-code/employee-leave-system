import mysql from 'mysql2/promise';
import request from 'supertest';
import type { Response } from 'supertest';
import type { Express } from 'express';
import type { Pool } from 'mysql2/promise';
import { randomBytes, randomUUID } from 'node:crypto';
import { loadConfig, type AppConfig } from '../src/config/env';
import { createPool } from '../src/db/pool';
import { createApp } from '../src/app';
import { execute } from '../src/db/query';
import { hashPassword } from '../src/lib/password';
import { sha256Hex } from '../src/lib/tokens';

export const ORIGIN = 'http://localhost:8081';
export const TEST_PASSWORD = 'TestPass1234!';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is missing. Server tests run against a real MySQL database; ` +
        'set the DB_* variables (see server/.env.example) and point them at a disposable database.'
    );
  }
  return value;
}

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    PORT: '4000',
    DB_HOST: process.env.DB_HOST ?? '127.0.0.1',
    DB_PORT: process.env.DB_PORT ?? '3306',
    DB_NAME: process.env.DB_NAME ?? 'leave_system',
    DB_APP_USER: required('DB_APP_USER'),
    DB_APP_PASSWORD: required('DB_APP_PASSWORD'),
    JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    JWT_REFRESH_SECRET: randomBytes(48).toString('base64url'),
    JWT_ISSUER: 'leave-system-api',
    JWT_AUDIENCE: 'leave-system-client',
    CORS_ORIGINS: ORIGIN,
    TRUST_PROXY: '0',
    COOKIE_SECURE: 'true',
    FORCE_HTTPS: 'false',
    GLOBAL_RATE_LIMIT_MAX: '5000',
    LOGIN_RATE_LIMIT_MAX: '100',
    REFRESH_RATE_LIMIT_MAX: '500',
    ...overrides,
  };
  return loadConfig({ ...process.env, ...base });
}

export interface TestUser {
  id: number;
  email: string;
  password: string;
  role: 'employee' | 'admin';
}

export interface Harness {
  app: Express;
  pool: Pool;
  config: AppConfig;
  migrator: mysql.Connection;
  createdUserIds: number[];
  createUser(options?: {
    role?: 'employee' | 'admin';
    active?: boolean;
    password?: string;
    name?: string;
  }): Promise<TestUser>;
  close(): Promise<void>;
}

export async function createHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const config = testConfig(overrides);
  const pool = createPool(config);
  const app = createApp(config, pool);

  const migrator = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: process.env.DB_MIGRATOR_USER ?? 'leave_migrator',
    password: required('DB_MIGRATOR_PASSWORD'),
    database: config.db.database,
    charset: 'utf8mb4',
    multipleStatements: false,
  });

  const createdUserIds: number[] = [];

  async function createUser(options: {
    role?: 'employee' | 'admin';
    active?: boolean;
    password?: string;
    name?: string;
  } = {}): Promise<TestUser> {
    const email = `test-${randomUUID()}@example.com`;
    const password = options.password ?? TEST_PASSWORD;
    const passwordHash = await hashPassword(password);
    const result = await execute(
      pool,
      `INSERT INTO users (name, email, password_hash, role, position, department, phone, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        options.name ?? 'Test Person',
        email,
        passwordHash,
        options.role ?? 'employee',
        'Tester',
        'Quality',
        null,
        options.active === false ? 0 : 1,
      ]
    );
    createdUserIds.push(result.insertId);
    return { id: result.insertId, email, password, role: options.role ?? 'employee' };
  }

  return {
    app,
    pool,
    config,
    migrator,
    createdUserIds,
    createUser,
    async close() {
      if (createdUserIds.length > 0) {
        for (const id of createdUserIds) {
          await migrator.query('DELETE FROM activity_logs WHERE user_id = ?', [id]);
          await migrator.query('DELETE FROM users WHERE id = ?', [id]);
        }
      }
      await pool.end().catch(() => undefined);
      await migrator.end().catch(() => undefined);
    },
  };
}

export function loginRequest(
  app: Express,
  email: string,
  password: string,
  client: 'web' | 'native' = 'native'
) {
  const req = request(app)
    .post('/api/auth/login')
    .set('X-Client', client)
    .set('Content-Type', 'application/json');
  if (client === 'web') {
    req.set('Origin', ORIGIN).set('X-Requested-With', 'XMLHttpRequest');
  }
  return req.send({ email, password });
}

export function refreshRequest(app: Express, client: 'web' | 'native', token?: string) {
  if (client === 'native') {
    return request(app)
      .post('/api/auth/refresh')
      .set('X-Client', 'native')
      .set('Content-Type', 'application/json')
      .send(token ? { refreshToken: token } : {});
  }
  const req = request(app)
    .post('/api/auth/refresh')
    .set('X-Client', 'web')
    .set('Origin', ORIGIN)
    .set('X-Requested-With', 'XMLHttpRequest');
  if (token) req.set('Cookie', `ls_rt=${token}`);
  return req.send();
}

export function logoutRequest(
  app: Express,
  accessToken: string,
  client: 'web' | 'native',
  refreshToken?: string
) {
  const req = request(app)
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${accessToken}`)
    .set('X-Client', client);
  if (client === 'web') {
    req.set('Origin', ORIGIN).set('X-Requested-With', 'XMLHttpRequest');
    if (refreshToken) req.set('Cookie', `ls_rt=${refreshToken}`);
  } else {
    req.set('Content-Type', 'application/json');
    if (refreshToken) return req.send({ refreshToken });
  }
  return req.send();
}

export function refreshCookie(res: Response): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(header) ? (header as string[]) : typeof header === 'string' ? [header] : [];
  const cookie = list.find((value) => value.startsWith('ls_rt='));
  if (!cookie) return undefined;
  return cookie.split(';')[0]?.slice('ls_rt='.length);
}

export function refreshCookieHeader(res: Response): string | undefined {
  const header = res.headers['set-cookie'] as unknown;
  const list = Array.isArray(header) ? (header as string[]) : typeof header === 'string' ? [header] : [];
  return list.find((value) => value.startsWith('ls_rt='));
}

/** Direct DB edit for timeout/deactivation tests (migration credentials). */
export async function sql(h: Harness, statement: string, params: unknown[] = []): Promise<void> {
  await h.migrator.query(statement, params);
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}
