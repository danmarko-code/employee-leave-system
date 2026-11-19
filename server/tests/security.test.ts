import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { Harness } from './helpers';
import {
  createHarness,
  loginRequest,
  refreshRequest,
  refreshCookie,
  ORIGIN,
} from './helpers';

describe('transport, CSRF, rate limiting and input handling', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  it('rejects a web refresh without the CSRF header or with a foreign Origin', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password, 'web');
    const cookie = refreshCookie(login);

    const noHeader = await request(h.app)
      .post('/api/auth/refresh')
      .set('X-Client', 'web')
      .set('Origin', ORIGIN)
      .set('Cookie', `ls_rt=${cookie}`)
      .send();
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.code).toBe('csrf_failed');

    const badOrigin = await request(h.app)
      .post('/api/auth/refresh')
      .set('X-Client', 'web')
      .set('Origin', 'http://evil.example')
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('Cookie', `ls_rt=${cookie}`)
      .send();
    expect(badOrigin.status).toBe(403);

    // Neither blocked attempt consumed the token.
    const good = await refreshRequest(h.app, 'web', cookie);
    expect(good.status).toBe(200);
  });

  it('only returns CORS headers for exact allow-listed origins', async () => {
    const evil = await request(h.app)
      .options('/api/auth/login')
      .set('Origin', 'http://evil.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();

    const good = await request(h.app)
      .options('/api/auth/login')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(good.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(good.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sets security headers and a request id on errors', async () => {
    const res = await request(h.app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|sql|mysql|argon2/i);
  });

  it('returns generic 404s', async () => {
    const res = await request(h.app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('rejects unknown fields, prototype-pollution keys and wrong content types', async () => {
    const user = await h.createUser();

    const unknown = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .set('Content-Type', 'application/json')
      .send({ email: user.email, password: user.password, role: 'admin' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('invalid_input');

    const raw = `{"__proto__":{"polluted":true},"email":${JSON.stringify(user.email)},"password":${JSON.stringify(
      user.password
    )}}`;
    const pollution = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .set('Content-Type', 'application/json')
      .send(raw);
    expect(pollution.status).toBe(400);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();

    const form = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .type('form')
      .send(`email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(user.password)}`);
    expect(form.status).toBe(415);
  });

  it('rejects oversized JSON bodies with 413', async () => {
    const res = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'a@example.com', password: 'a'.repeat(40_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('payload_too_large');
  });

  it('survives SQL injection attempts in the login field without leaking or delaying', async () => {
    const attempts = [
      "' OR '1'='1",
      "'; DROP TABLE users;--",
      "' UNION SELECT password_hash FROM users--",
      "a@example.com' OR SLEEP(3)--",
    ];

    for (const email of attempts) {
      const started = Date.now();
      const res = await request(h.app)
        .post('/api/auth/login')
        .set('X-Client', 'native')
        .set('Content-Type', 'application/json')
        .send({ email, password: 'Whatever123!' });
      const elapsed = Date.now() - started;

      expect([400, 401]).toContain(res.status);
      expect(JSON.stringify(res.body)).not.toMatch(/sql|syntax|users|password_hash/i);
      expect(elapsed).toBeLessThan(2_000);
    }

    const [rows] = await h.migrator.query('SELECT COUNT(*) AS count FROM users');
    expect(Number((rows as Array<{ count: number }>)[0]?.count)).toBeGreaterThan(0);
  });

  it('enforces the role gate on admin routes and audits the denial', async () => {
    const employee = await h.createUser();
    const admin = await h.createUser({ role: 'admin' });
    const employeeLogin = await loginRequest(h.app, employee.email, employee.password);
    const adminLogin = await loginRequest(h.app, admin.email, admin.password);

    const denied = await request(h.app)
      .get('/api/admin/activity-logs')
      .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden');

    const allowed = await request(h.app)
      .get('/api/admin/activity-logs')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body.items)).toBe(true);

    const [rows] = await h.migrator.query(
      "SELECT COUNT(*) AS count FROM activity_logs WHERE user_id = ? AND action = 'access_denied'",
      [employee.id]
    );
    expect(Number((rows as Array<{ count: number }>)[0]?.count)).toBeGreaterThan(0);
  });

  it('never puts emails or passwords in activity logs or API responses', async () => {
    const employee = await h.createUser();
    const admin = await h.createUser({ role: 'admin' });
    await loginRequest(h.app, employee.email, 'WrongPass1234!');
    const login = await loginRequest(h.app, employee.email, employee.password);
    const adminLogin = await loginRequest(h.app, admin.email, admin.password);

    const res = await request(h.app)
      .get('/api/admin/activity-logs')
      .query({ userId: employee.id, pageSize: 100 })
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(employee.email);
    expect(JSON.stringify(res.body)).not.toContain(employee.password);

    const [rows] = await h.migrator.query(
      'SELECT action, target_type, ip_address FROM activity_logs WHERE user_id = ?',
      [employee.id]
    );
    expect(JSON.stringify(rows)).not.toContain(employee.email);
    expect(JSON.stringify(login.body)).not.toContain('password');
  });

  it('rejects mass assignment on the profile update', async () => {
    const user = await h.createUser();
    const login = await loginRequest(h.app, user.email, user.password);

    for (const payload of [
      { role: 'admin' },
      { is_active: 0 },
      { user_id: 1 },
      { status: 'approved' },
      { phone: '0917 123 4567', role: 'admin' },
    ]) {
      const res = await request(h.app)
        .patch('/api/me')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .set('Content-Type', 'application/json')
        .send(payload);
      expect(res.status).toBe(400);
    }

    const [rows] = await h.migrator.query('SELECT role, is_active FROM users WHERE id = ?', [user.id]);
    const row = (rows as Array<{ role: string; is_active: number }>)[0];
    expect(row?.role).toBe('employee');
    expect(row?.is_active).toBe(1);

    const ok = await request(h.app)
      .patch('/api/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .set('Content-Type', 'application/json')
      .send({ phone: '+63 917 123 4567' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.phone).toBe('+63 917 123 4567');
  });

  it('returns 429 after too many login attempts from one IP', async () => {
    const limited = await createHarness({ LOGIN_RATE_LIMIT_MAX: '3' });
    try {
      const email = `rate-${randomUUID()}@example.com`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await loginRequest(limited.app, email, 'WrongPass1234!');
        expect(res.status).toBe(401);
      }
      const blocked = await loginRequest(limited.app, email, 'WrongPass1234!');
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('rate_limited');
    } finally {
      await limited.close();
    }
  });

  it('refuses plain HTTP when HTTPS is enforced, with HSTS in production', async () => {
    const dev = await createHarness({ FORCE_HTTPS: 'true' });
    try {
      const res = await request(dev.app).get('/api/me');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('https_required');
    } finally {
      await dev.close();
    }

    const prod = await createHarness({
      NODE_ENV: 'production',
      FORCE_HTTPS: 'true',
      CORS_ORIGINS: 'https://app.example.com',
      COOKIE_SECURE: 'true',
      TRUST_PROXY: '0',
    });
    try {
      const res = await request(prod.app).get('/api/me');
      expect(res.status).toBe(403);
      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    } finally {
      await prod.close();
    }
  });
});
