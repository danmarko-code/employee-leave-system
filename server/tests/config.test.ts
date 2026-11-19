import { loadConfig } from '../src/config/env';

const BASE: Record<string, string> = {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_APP_USER: 'leave_app',
  DB_APP_PASSWORD: 'a'.repeat(32),
  JWT_ACCESS_SECRET: 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v2W3x4Y5z6',
  JWT_REFRESH_SECRET: 'Z9y8X7w6V5u4T3s2R1q0P9o8N7m6L5k4J3i2H1g0F9e8D7c6B5a4',
  CORS_ORIGINS: 'https://app.example.com',
};

function load(overrides: Record<string, string | undefined>) {
  const env: Record<string, string> = { ...BASE };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  return loadConfig(env);
}

describe('startup configuration validation (fail closed)', () => {
  it('accepts a valid configuration and freezes it', () => {
    const config = load({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(config.corsOrigins).toEqual(['https://app.example.com']);
  });

  it('refuses a missing application password', () => {
    expect(() => load({ DB_APP_PASSWORD: undefined })).toThrow(/DB_APP_PASSWORD/);
  });

  it('refuses short or placeholder secrets and identical secrets', () => {
    expect(() => load({ JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => load({ JWT_REFRESH_SECRET: BASE.JWT_ACCESS_SECRET })).toThrow(/different/);
    expect(() => load({ JWT_ACCESS_SECRET: `change-me-${'x'.repeat(40)}` })).toThrow(/placeholder/);
  });

  it('refuses a privileged DB account or root', () => {
    for (const user of ['root', 'leave_migrator', 'leave_report', 'admin']) {
      expect(() => load({ DB_APP_USER: user })).toThrow(/least-privilege/);
    }
  });

  it('refuses wildcard, invalid and (in production) plain-http origins', () => {
    expect(() => load({ CORS_ORIGINS: '*' })).toThrow();
    expect(() => load({ CORS_ORIGINS: 'not a url' })).toThrow(/invalid origin/);
    expect(() => load({ CORS_ORIGINS: 'https://app.example.com/path' })).toThrow(/bare origins/);
    expect(() =>
      load({ NODE_ENV: 'production', CORS_ORIGINS: 'http://app.example.com' })
    ).toThrow(/https/);
  });

  it('refuses a non-Secure cookie in production and defaults to Secure', () => {
    expect(() =>
      load({ NODE_ENV: 'production', COOKIE_SECURE: 'false' })
    ).toThrow(/COOKIE_SECURE/);
    expect(load({}).cookie.secure).toBe(true);
  });

  it('validates numeric ranges instead of silently coercing', () => {
    expect(() => load({ PORT: 'abc' })).toThrow(/whole number/);
    expect(() => load({ DB_PORT: '70000' })).toThrow(/between/);
    expect(() => load({ TRUST_PROXY: 'true' })).toThrow(/whole number/);
  });
});
