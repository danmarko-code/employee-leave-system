import { z } from 'zod';
import path from 'node:path';

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'silent' | 'error' | 'warn' | 'info';

export interface AppConfig {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  logLevel: LogLevel;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    issuer: string;
    audience: string;
  };
  corsOrigins: readonly string[];
  trustProxy: number;
  forceHttps: boolean;
  cookie: {
    name: string;
    secure: boolean;
    domain?: string;
    path: string;
    maxAgeMs: number;
  };
  rateLimits: {
    globalMax: number;
    loginMax: number;
    refreshMax: number;
    /** Photo uploads, per client IP, in the shared window. */
    photoMax: number;
    windowMs: number;
  };
  /** Absolute directory for supporting documents; never served statically. */
  uploadDir: string;
}

const ENV_SCHEMA = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().optional(),
  LOG_LEVEL: z.enum(['silent', 'error', 'warn', 'info']).default('info'),
  DB_HOST: z.string().min(1, 'DB_HOST is required.'),
  DB_PORT: z.string().optional(),
  DB_NAME: z.string().min(1).default('leave_system'),
  DB_APP_USER: z.string().min(1, 'DB_APP_USER is required.'),
  DB_APP_PASSWORD: z.string().min(16, 'DB_APP_PASSWORD is required (16+ characters).'),
  JWT_ACCESS_SECRET: z.string().min(43, 'JWT_ACCESS_SECRET must be at least 43 characters (32 random bytes, base64url).'),
  JWT_REFRESH_SECRET: z.string().min(43, 'JWT_REFRESH_SECRET must be at least 43 characters (32 random bytes, base64url).'),
  JWT_ISSUER: z.string().min(1).default('leave-system-api'),
  JWT_AUDIENCE: z.string().min(1).default('leave-system-client'),
  CORS_ORIGINS: z.string().min(1, 'CORS_ORIGINS is required.'),
  TRUST_PROXY: z.string().optional(),
  COOKIE_SECURE: z.string().optional(),
  COOKIE_DOMAIN: z.string().optional(),
  FORCE_HTTPS: z.string().optional(),
  GLOBAL_RATE_LIMIT_MAX: z.string().optional(),
  LOGIN_RATE_LIMIT_MAX: z.string().optional(),
  REFRESH_RATE_LIMIT_MAX: z.string().optional(),
  PHOTO_RATE_LIMIT_MAX: z.string().optional(),
  UPLOAD_DIR: z.string().optional(),
});

const FORBIDDEN_APP_USERS = new Set(['root', 'leave_migrator', 'leave_report', 'mysql', 'admin']);

function configError(messages: string[]): never {
  throw new Error(`Invalid server configuration:\n- ${messages.join('\n- ')}`);
}

function toInt(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) configError([`${name} must be a whole number.`]);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    configError([`${name} must be between ${min} and ${max}.`]);
  }
  return parsed;
}

function toBool(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  configError([`${name} must be "true" or "false".`]);
}

function assertSecret(name: string, value: string): void {
  if (new Set(value).size < 8) {
    configError([`${name} is not random enough. Generate it with crypto.randomBytes(48).toString('base64url').`]);
  }
  if (/^(change|example|secret|password|replace)/i.test(value)) {
    configError([`${name} still looks like a placeholder.`]);
  }
}

function resolveUploadDir(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return path.resolve(process.cwd(), 'var', 'uploads');
  if (!path.isAbsolute(value)) {
    configError(['UPLOAD_DIR must be an absolute path, outside any web root.']);
  }
  return path.resolve(value);
}

function parseOrigins(raw: string, isProduction: boolean): string[] {
  const origins = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (origins.length === 0) configError(['CORS_ORIGINS must list at least one exact origin.']);

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      configError([`CORS_ORIGINS contains an invalid origin: ${origin}`]);
    }
    if (parsed.origin !== origin) {
      configError([`CORS_ORIGINS entries must be bare origins (no path or slash): ${origin}`]);
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      configError([`CORS_ORIGINS must use http or https: ${origin}`]);
    }
    const localHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
    if (isProduction && parsed.protocol !== 'https:' && !localHost) {
      configError([`CORS_ORIGINS must use https in production: ${origin}`]);
    }
    if (isProduction && parsed.protocol === 'http:' && !localHost) {
      configError([`CORS_ORIGINS cannot use plain http in production: ${origin}`]);
    }
  }

  return [...new Set(origins)];
}

/**
 * Validates process environment at startup and fails closed. Never prints
 * secret values, only the names and rules that were violated.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ENV_SCHEMA.safeParse(env);
  if (!parsed.success) {
    configError(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`));
  }
  const raw = parsed.data;
  const isProduction = raw.NODE_ENV === 'production';

  if (FORBIDDEN_APP_USERS.has(raw.DB_APP_USER.toLowerCase())) {
    configError(['DB_APP_USER must be the least-privilege application account, not root, a migration account or a report account.']);
  }
  if (raw.JWT_ACCESS_SECRET === raw.JWT_REFRESH_SECRET) {
    configError(['JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values.']);
  }
  assertSecret('JWT_ACCESS_SECRET', raw.JWT_ACCESS_SECRET);
  assertSecret('JWT_REFRESH_SECRET', raw.JWT_REFRESH_SECRET);

  const corsOrigins = parseOrigins(raw.CORS_ORIGINS, isProduction);
  if (corsOrigins.includes('*')) configError(['CORS_ORIGINS cannot contain a wildcard.']);

  const cookieSecure = toBool('COOKIE_SECURE', raw.COOKIE_SECURE, true);
  if (isProduction && !cookieSecure) {
    configError(['COOKIE_SECURE cannot be false in production.']);
  }

  const forceHttps = toBool('FORCE_HTTPS', raw.FORCE_HTTPS, isProduction);

  const maxAgeMs = 12 * 60 * 60 * 1000;

  return Object.freeze({
    nodeEnv: raw.NODE_ENV,
    isProduction,
    port: toInt('PORT', raw.PORT, 4000, 1, 65535),
    logLevel: raw.LOG_LEVEL,
    db: {
      host: raw.DB_HOST,
      port: toInt('DB_PORT', raw.DB_PORT, 3306, 1, 65535),
      database: raw.DB_NAME,
      user: raw.DB_APP_USER,
      password: raw.DB_APP_PASSWORD,
    },
    jwt: {
      accessSecret: raw.JWT_ACCESS_SECRET,
      refreshSecret: raw.JWT_REFRESH_SECRET,
      issuer: raw.JWT_ISSUER,
      audience: raw.JWT_AUDIENCE,
    },
    corsOrigins,
    trustProxy: toInt('TRUST_PROXY', raw.TRUST_PROXY, isProduction ? 1 : 0, 0, 10),
    forceHttps,
    cookie: {
      name: 'ls_rt',
      secure: cookieSecure,
      domain: raw.COOKIE_DOMAIN || undefined,
      path: '/api/auth',
      maxAgeMs,
    },
    rateLimits: {
      globalMax: toInt('GLOBAL_RATE_LIMIT_MAX', raw.GLOBAL_RATE_LIMIT_MAX, 300, 10, 100000),
      loginMax: toInt('LOGIN_RATE_LIMIT_MAX', raw.LOGIN_RATE_LIMIT_MAX, 10, 3, 1000),
      refreshMax: toInt('REFRESH_RATE_LIMIT_MAX', raw.REFRESH_RATE_LIMIT_MAX, 60, 3, 1000),
      photoMax: toInt('PHOTO_RATE_LIMIT_MAX', raw.PHOTO_RATE_LIMIT_MAX, 20, 2, 1000),
      windowMs: 15 * 60 * 1000,
    },
    uploadDir: resolveUploadDir(raw.UPLOAD_DIR),
  });
}
