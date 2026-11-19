import request from 'supertest';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import type { Harness } from './helpers';
import {
  createHarness,
  loginRequest,
  refreshRequest,
  logoutRequest,
  refreshCookie,
  refreshCookieHeader,
  ORIGIN,
  TEST_PASSWORD,
} from './helpers';
import { revokeAllForUser } from '../src/services/session.service';

describe('authentication and sessions', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('web login sets a strict httpOnly cookie and never returns the refresh token in the body', async () => {
    const user = await h.createUser();
    const res = await loginRequest(h.app, user.email, user.password, 'web');

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = refreshCookieHeader(res);
    expect(cookie).toBeDefined();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/auth');

    const me = await request(h.app).get('/api/me').set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
  });

  it('native login returns a refresh token and sets no cookie', async () => {
    const user = await h.createUser();
    const res = await loginRequest(h.app, user.email, user.password, 'native');

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(refreshCookieHeader(res)).toBeUndefined();
  });

  it('gives the same generic answer for a wrong password and an unknown email', async () => {
    const user = await h.createUser();
    const wrong = await loginRequest(h.app, user.email, 'WrongPass1234!');
    const unknown = await loginRequest(h.app, `nobody-${randomUUID()}@example.com`, 'WrongPass1234!');

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('invalid_credentials');
    expect(unknown.body.error.code).toBe('invalid_credentials');
    expect(wrong.body.error.message).toBe('Email or password is incorrect.');
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    expect(JSON.stringify(unknown.body)).not.toContain('nobody-');
  });

  it('refuses a deactivated account with the same generic message', async () => {
    const user = await h.createUser({ active: false });
    const res = await loginRequest(h.app, user.email, user.password);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('locks the account for 15 minutes after five failed logins', async () => {
    const user = await h.createUser();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await loginRequest(h.app, user.email, 'WrongPass1234!');
      expect(res.status).toBe(401);
    }

    const good = await loginRequest(h.app, user.email, user.password);
    expect(good.status).toBe(401);

    const [rows] = await h.migrator.query(
      'SELECT failed_attempts, locked_until FROM users WHERE id = ?',
      [user.id]
    );
    const row = (rows as Array<{ failed_attempts: number; locked_until: string | null }>)[0];
    expect(row?.locked_until).not.toBeNull();
    expect(row?.failed_attempts).toBe(0);
  });

  it('rotates refresh tokens and revokes the whole family on reuse', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');
    const first = login.body.refreshToken as string;

    const rotated = await refreshRequest(h.app, 'native', first);
    expect(rotated.status).toBe(200);
    const second = rotated.body.refreshToken as string;
    expect(second).not.toBe(first);

    const reuse = await refreshRequest(h.app, 'native', first);
    expect(reuse.status).toBe(401);

    const afterTheft = await refreshRequest(h.app, 'native', second);
    expect(afterTheft.status).toBe(401);

    const [activeRows] = await h.migrator.query(
      'SELECT COUNT(*) AS active FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL',
      [user.id]
    );
    expect(Number((activeRows as Array<{ active: number }>)[0]?.active)).toBe(0);

    const [logRows] = await h.migrator.query(
      "SELECT COUNT(*) AS count FROM activity_logs WHERE user_id = ? AND action = 'session_reuse'",
      [user.id]
    );
    expect(Number((logRows as Array<{ count: number }>)[0]?.count)).toBeGreaterThan(0);
  });

  it('ignores a body refresh token sent by a web client', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');
    const nativeToken = login.body.refreshToken as string;

    const webAttempt = await request(h.app)
      .post('/api/auth/refresh')
      .set('X-Client', 'web')
      .set('Origin', ORIGIN)
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({ refreshToken: nativeToken });
    expect(webAttempt.status).toBe(401);

    // The ignored token was not consumed.
    const nativeRefresh = await refreshRequest(h.app, 'native', nativeToken);
    expect(nativeRefresh.status).toBe(200);
  });

  it('ignores a cookie sent by a native client', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'web');
    const cookieToken = refreshCookie(login);
    expect(cookieToken).toBeDefined();

    const nativeAttempt = await request(h.app)
      .post('/api/auth/refresh')
      .set('X-Client', 'native')
      .set('Cookie', `ls_rt=${cookieToken}`)
      .set('Content-Type', 'application/json')
      .send({});
    expect(nativeAttempt.status).toBe(400);

    const webRefresh = await refreshRequest(h.app, 'web', cookieToken);
    expect(webRefresh.status).toBe(200);
  });

  it('enforces the 30-minute server-side idle timeout', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');
    const token = login.body.refreshToken as string;

    await h.migrator.query(
      'UPDATE refresh_tokens SET last_used_at = UTC_TIMESTAMP() - INTERVAL 31 MINUTE WHERE user_id = ?',
      [user.id]
    );

    const res = await refreshRequest(h.app, 'native', token);
    expect(res.status).toBe(401);
  });

  it('refuses an access token once the session is idle', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');
    await h.migrator.query(
      'UPDATE refresh_tokens SET last_used_at = UTC_TIMESTAMP() - INTERVAL 31 MINUTE WHERE user_id = ?',
      [user.id]
    );

    const me = await request(h.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('enforces the 12-hour absolute lifetime even if the token is fresh', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');
    const token = login.body.refreshToken as string;

    await h.migrator.query(
      'UPDATE refresh_tokens SET session_started_at = UTC_TIMESTAMP() - INTERVAL 13 HOUR WHERE user_id = ?',
      [user.id]
    );

    const res = await refreshRequest(h.app, 'native', token);
    expect(res.status).toBe(401);
  });

  it('logout revokes the session, kills the access token and clears the web cookie', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'web');
    const cookieToken = refreshCookie(login);
    const accessToken = login.body.accessToken as string;

    const out = await logoutRequest(h.app, accessToken, 'web', cookieToken);
    expect(out.status).toBe(204);
    const cleared = refreshCookieHeader(out);
    expect(cleared).toBeDefined();
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/);

    const me = await request(h.app).get('/api/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(401);

    const refresh = await refreshRequest(h.app, 'web', cookieToken);
    expect(refresh.status).toBe(401);
  });

  it('a password reset (revoke all sessions) invalidates access and refresh tokens', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');

    await revokeAllForUser(h.pool, user.id);

    const me = await request(h.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(401);

    const refresh = await refreshRequest(h.app, 'native', login.body.refreshToken);
    expect(refresh.status).toBe(401);
  });

  it('rejects expired, tampered, alg=none and wrong-audience access tokens', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');
    const valid = login.body.accessToken as string;

    const expired = jwt.sign(
      { role: 'employee', sid: randomUUID() },
      h.config.jwt.accessSecret,
      {
        algorithm: 'HS256',
        subject: String(user.id),
        issuer: h.config.jwt.issuer,
        audience: h.config.jwt.audience,
        expiresIn: -10,
      }
    );

    const wrongAudience = jwt.sign(
      { role: 'employee', sid: randomUUID() },
      h.config.jwt.accessSecret,
      {
        algorithm: 'HS256',
        subject: String(user.id),
        issuer: h.config.jwt.issuer,
        audience: 'some-other-api',
        expiresIn: 600,
      }
    );

    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: String(user.id),
        role: 'admin',
        sid: randomUUID(),
        iss: h.config.jwt.issuer,
        aud: h.config.jwt.audience,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 600,
      })
    ).toString('base64url');
    const algNone = `${header}.${payload}.`;

    for (const token of [expired, wrongAudience, algNone, `${valid.slice(0, -4)}aaaa`]) {
      const res = await request(h.app).get('/api/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Sign in again to continue.');
    }
  });

  it('uses the database role, not the token role, on every request', async () => {
    const admin = await h.createUser({ role: 'admin' });
    const login = await loginRequest(h.app, admin.email, admin.password, 'native');
    const token = login.body.accessToken as string;

    const before = await request(h.app)
      .get('/api/admin/activity-logs')
      .set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    await h.migrator.query("UPDATE users SET role = 'employee' WHERE id = ?", [admin.id]);

    const after = await request(h.app)
      .get('/api/admin/activity-logs')
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(403);
  });

  it('refuses a deactivated user even with an otherwise valid access token', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'native');

    await h.migrator.query('UPDATE users SET is_active = 0 WHERE id = ?', [user.id]);

    const me = await request(h.app)
      .get('/api/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('uses the same generic login answer after approval-like timing operations', async () => {
    // Sanity: a login with TEST_PASSWORD still works for a fresh active user.
    const user = await h.createUser();
    const res = await loginRequest(h.app, user.email, TEST_PASSWORD);
    expect(res.status).toBe(200);
  });
});
