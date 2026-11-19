import request from 'supertest';
import type { Harness, TestUser } from './helpers';
import {
  accessTokenFor,
  addDays,
  createHarness,
  upcomingMonday,
  yearOf,
} from './helpers';

async function countAudit(h: Harness, action: string, userId: number): Promise<number> {
  const [rows] = await h.migrator.query(
    'SELECT COUNT(*) AS count FROM activity_logs WHERE action = ? AND user_id = ?',
    [action, userId]
  );
  return Number((rows as Array<{ count: number }>)[0]?.count ?? 0);
}

describe('administrator features', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  async function admin(): Promise<{ user: TestUser; token: string }> {
    const user = await h.createUser({ role: 'admin' });
    return { user, token: await accessTokenFor(h.app, user) };
  }

  async function employee(): Promise<{ user: TestUser; token: string }> {
    const user = await h.createUser();
    return { user, token: await accessTokenFor(h.app, user) };
  }

  it('creates an account with a policy-checked password and refuses a duplicate email', async () => {
    const { token } = await admin();
    const email = `new-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

    const created = await request(h.app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Employee',
        email,
        password: 'FreshPass1234!',
        role: 'employee',
        position: 'Analyst',
        department: 'Finance',
        isActive: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ email, role: 'employee', isActive: true });
    expect(JSON.stringify(created.body)).not.toContain('password');
    const id = created.body.user.id as number;

    const login = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .send({ email, password: 'FreshPass1234!' });
    expect(login.status).toBe(200);

    const duplicate = await request(h.app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Copy', email, password: 'FreshPass1234!', role: 'employee' });
    expect(duplicate.status).toBe(409);

    const weak = await request(h.app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Weak', email: `weak-${email}`, password: 'password123', role: 'employee' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.message).toMatch(/common/i);

    const [rows] = await h.migrator.query(
      'SELECT password_hash FROM users WHERE id = ?',
      [id]
    );
    expect((rows as Array<{ password_hash: string }>)[0]?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('lists and searches accounts without leaking hashes', async () => {
    const { token } = await admin();
    const user = await h.createUser({ name: 'Searchable Person' });

    const res = await request(h.app)
      .get('/api/admin/users')
      .query({ q: 'Searchable' })
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.some((item: { id: number }) => item.id === user.id)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/password_hash|\$argon2/);
    expect(res.body.page).toBe(1);
  });

  it('deactivates an employee, revoking existing sessions immediately', async () => {
    const { token: adminToken } = await admin();
    const { user, token } = await employee();

    const before = await request(h.app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    const patch = await request(h.app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false, department: 'Operations' });
    expect(patch.status).toBe(200);
    expect(patch.body.user.isActive).toBe(false);
    expect(patch.body.user.department).toBe('Operations');

    const after = await request(h.app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);

    const login = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .send({ email: user.email, password: user.password });
    expect(login.status).toBe(401);
  });

  it('refuses to let an admin deactivate themselves or change their own role', async () => {
    const { user, token } = await admin();

    const deactivate = await request(h.app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(400);

    const demote = await request(h.app)
      .patch(`/api/admin/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'employee' });
    expect(demote.status).toBe(400);

    const me = await request(h.app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user.role).toBe('admin');
  });

  it('resets a password, revoking sessions and invalidating the old password', async () => {
    const { token: adminToken, user: adminUser } = await admin();
    const { user, token } = await employee();

    const reset = await request(h.app)
      .post(`/api/admin/users/${user.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ password: 'BrandNewPass1234!' });
    expect(reset.status).toBe(204);

    const oldSession = await request(h.app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(oldSession.status).toBe(401);

    const oldLogin = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .send({ email: user.email, password: 'BrandNewPass1234!' });
    expect(newLogin.status).toBe(200);

    expect(await countAudit(h, 'password_reset', adminUser.id)).toBeGreaterThanOrEqual(1);
  });

  it('manages leave types: create, rename, change entitlement and deactivate', async () => {
    const { token } = await admin();
    const { token: employeeToken } = await employee();
    const name = `Bereavement ${Date.now()}`;

    const created = await request(h.app)
      .post('/api/admin/leave-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, yearlyEntitlement: 3, requiresDocument: true, isActive: true });
    expect(created.status).toBe(201);
    expect(created.body.leaveType).toMatchObject({ name, yearlyEntitlement: 3, requiresDocument: true });
    const id = created.body.leaveType.id as number;

    const duplicate = await request(h.app)
      .post('/api/admin/leave-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, yearlyEntitlement: 2 });
    expect(duplicate.status).toBe(409);

    const updated = await request(h.app)
      .patch(`/api/admin/leave-types/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearlyEntitlement: 5, isActive: false });
    expect(updated.status).toBe(200);
    expect(updated.body.leaveType).toMatchObject({ yearlyEntitlement: 5, isActive: false });

    const publicList = await request(h.app)
      .get('/api/leave-types')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect((publicList.body.items as Array<{ id: number }>).some((item) => item.id === id)).toBe(false);

    const adminList = await request(h.app)
      .get('/api/admin/leave-types')
      .set('Authorization', `Bearer ${token}`);
    expect((adminList.body.items as Array<{ id: number }>).some((item) => item.id === id)).toBe(true);

    const negative = await request(h.app)
      .post('/api/admin/leave-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Bad ${Date.now()}`, yearlyEntitlement: -1 });
    expect(negative.status).toBe(400);
  });

  it('reports dashboard counts and a year summary that includes approved and pending days', async () => {
    const { token: adminToken } = await admin();
    const user = await h.createUser({ name: 'Report Person' });
    const token = await accessTokenFor(h.app, user);
    const type = await h.createLeaveType({ entitlement: 10 });
    const start = upcomingMonday();
    const end = addDays(start, 4);

    const created = await request(h.app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${token}`)
      .field('leaveTypeId', String(type.id))
      .field('startDate', start)
      .field('endDate', end)
      .field('reason', 'Report check');
    expect(created.status).toBe(201);

    await request(h.app)
      .post(`/api/admin/leaves/${created.body.application.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });

    const dashboard = await request(h.app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.approved).toBeGreaterThanOrEqual(1);
    expect(dashboard.body.activeLeaveTypes).toBeGreaterThanOrEqual(1);

    const summary = await request(h.app)
      .get('/api/admin/reports/leave-summary')
      .query({ year: yearOf(start) })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.year).toBe(yearOf(start));
    const row = (summary.body.rows as Array<Record<string, unknown>>).find(
      (item) => item.userId === user.id && item.leaveTypeId === type.id
    );
    expect(row).toMatchObject({
      employeeName: 'Report Person',
      entitlement: 10,
      approvedDays: 5,
      remainingDays: 5,
    });
    expect(summary.body.totals.approvedDays).toBeGreaterThanOrEqual(5);

    expect(await countAudit(h, 'report_generated', user.id)).toBe(0);
  });

  it('exports the applications report as CSV with formula-injection protection', async () => {
    const { token: adminToken, user: adminUser } = await admin();
    const email = `formula-${Date.now()}@example.com`;
    const createdUser = await request(h.app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '=SUM(1)', email, password: 'FormulaPass1234!', role: 'employee' });
    expect(createdUser.status).toBe(201);
    const userId = createdUser.body.user.id as number;

    const login = await request(h.app)
      .post('/api/auth/login')
      .set('X-Client', 'native')
      .send({ email, password: 'FormulaPass1234!' });
    const userToken = login.body.accessToken as string;

    const type = await h.createLeaveType({ entitlement: 10 });
    const start = upcomingMonday();
    const created = await request(h.app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${userToken}`)
      .field('leaveTypeId', String(type.id))
      .field('startDate', start)
      .field('endDate', addDays(start, 0))
      .field('reason', 'CSV check');
    expect(created.status).toBe(201);

    const csv = await request(h.app)
      .get('/api/admin/reports/applications')
      .query({ userId, format: 'csv' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    expect(csv.text).toContain('"\'=SUM(1)"');
    expect(csv.text).toContain('"Employee"');
    expect(csv.text).not.toContain('"=SUM(1)"');

    const json = await request(h.app)
      .get('/api/admin/reports/applications')
      .query({ userId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(json.status).toBe(200);
    expect(json.body.items[0]).toMatchObject({ employeeName: '=SUM(1)', workingDays: 1 });

    expect(await countAudit(h, 'report_generated', adminUser.id)).toBeGreaterThanOrEqual(1);
  });

  it('denies every admin endpoint to an employee', async () => {
    const { token } = await employee();
    const paths = [
      '/api/admin/users',
      '/api/admin/leave-types',
      '/api/admin/leaves',
      '/api/admin/dashboard',
      '/api/admin/reports/leave-summary',
      '/api/admin/reports/applications',
      '/api/admin/activity-logs',
    ];
    for (const path of paths) {
      const res = await request(h.app).get(path).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });

  it('records admin actions in the audit log without free text', async () => {
    const { token, user } = await admin();
    const name = `Audit type ${Date.now()}`;
    await request(h.app)
      .post('/api/admin/leave-types')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, yearlyEntitlement: 1 });

    expect(await countAudit(h, 'leave_type_changed', user.id)).toBeGreaterThanOrEqual(1);

    const [rows] = await h.migrator.query(
      'SELECT action, target_type FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 5',
      [user.id]
    );
    expect(JSON.stringify(rows)).not.toContain(name);
  });
});
