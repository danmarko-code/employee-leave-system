import request from 'supertest';
import { readdirSync } from 'node:fs';
import type { Harness, TestUser } from './helpers';
import {
  accessTokenFor,
  addDays,
  createHarness,
  loginRequest,
  MISLABELLED_FILE,
  PDF_FILE,
  submitLeaveRequest,
  upcomingMonday,
  yearOf,
} from './helpers';

function week(): { start: string; end: string } {
  let start = upcomingMonday();
  let end = addDays(start, 4);
  if (yearOf(start) !== yearOf(end)) {
    start = addDays(start, 7);
    end = addDays(start, 4);
  }
  return { start, end };
}

describe('leave applications', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  afterAll(async () => {
    await h.close();
  });

  async function employee(): Promise<{ user: TestUser; token: string }> {
    const user = await h.createUser();
    return { user, token: await accessTokenFor(h.app, user) };
  }

  it('lists active leave types with a per-person balance for the year', async () => {
    const { token } = await employee();
    const vacation = await h.createLeaveType({ entitlement: 10 });
    const inactive = await h.createLeaveType({ active: false });

    const types = await request(h.app)
      .get('/api/leave-types')
      .set('Authorization', `Bearer ${token}`);
    expect(types.status).toBe(200);
    const ids = (types.body.items as Array<{ id: number }>).map((item) => item.id);
    expect(ids).toContain(vacation.id);
    expect(ids).not.toContain(inactive.id);

    const { start } = week();
    const balances = await request(h.app)
      .get('/api/leave-balances')
      .query({ year: yearOf(start) })
      .set('Authorization', `Bearer ${token}`);
    expect(balances.status).toBe(200);
    const row = (balances.body.items as Array<Record<string, unknown>>).find(
      (item) => item.id === vacation.id
    );
    expect(row).toMatchObject({
      yearlyEntitlement: 10,
      approvedDays: 0,
      pendingDays: 0,
      remainingDays: 10,
      year: yearOf(start),
    });
  });

  it('creates a Monday-to-Friday application and counts working days', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType({ entitlement: 10 });
    const { start, end } = week();

    const res = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
      reason: 'Family trip',
    });

    expect(res.status).toBe(201);
    expect(res.body.application).toMatchObject({
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
      workingDays: 5,
      status: 'pending',
      reason: 'Family trip',
      document: null,
      decidedAt: null,
    });
  });

  it('rejects weekend-only dates, past dates and unknown leave types', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType();

    const saturday = (() => {
      let date = upcomingMonday();
      date = addDays(date, 5);
      return date;
    })();

    const weekend = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: saturday,
      endDate: addDays(saturday, 1),
    });
    expect(weekend.status).toBe(400);
    expect(weekend.body.error.fields.startDate).toMatch(/no working days/i);

    const past = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: '2020-01-06',
      endDate: '2020-01-07',
    });
    expect(past.status).toBe(400);

    const unknown = await submitLeaveRequest(h.app, token, {
      leaveTypeId: 999999,
      startDate: week().start,
      endDate: week().end,
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.fields.leaveTypeId).toMatch(/not available/i);
  });

  it('requires the document when the leave type needs one and stores it under a random name', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType({ requiresDocument: true });
    const { start, end } = week();

    const missing = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error.fields.document).toMatch(/supporting document/i);

    const ok = await submitLeaveRequest(
      h.app,
      token,
      { leaveTypeId: type.id, startDate: start, endDate: end },
      PDF_FILE
    );
    expect(ok.status).toBe(201);
    expect(ok.body.application.document).toMatchObject({
      originalName: 'medical-certificate.pdf',
      mimeType: 'application/pdf',
      sizeBytes: PDF_FILE.buffer.length,
    });

    const files = readdirSync(h.uploadDir);
    expect(files.some((name) => /^[0-9a-f-]{36}\.pdf$/.test(name))).toBe(true);
    expect(files).not.toContain('medical-certificate.pdf');
  });

  it('rejects a file whose content does not match its declared type', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType({ requiresDocument: true });
    const { start, end } = week();
    const before = readdirSync(h.uploadDir).length;

    const res = await submitLeaveRequest(
      h.app,
      token,
      { leaveTypeId: type.id, startDate: start, endDate: end },
      MISLABELLED_FILE
    );
    expect(res.status).toBe(400);
    expect(res.body.error.fields.document).toMatch(/does not match/i);
    expect(readdirSync(h.uploadDir)).toHaveLength(before);
  });

  it('rejects an upload over 1 MB with 413', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType({ requiresDocument: true });
    const { start, end } = week();
    const big = {
      buffer: Buffer.concat([PDF_FILE.buffer, Buffer.alloc(1024 * 1024)]),
      filename: 'big.pdf',
      contentType: 'application/pdf',
    };

    const res = await submitLeaveRequest(
      h.app,
      token,
      { leaveTypeId: type.id, startDate: start, endDate: end },
      big
    );
    expect(res.status).toBe(413);
  });

  it('refuses overlapping pending or approved dates', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType();
    const { start, end } = week();

    expect(
      (await submitLeaveRequest(h.app, token, { leaveTypeId: type.id, startDate: start, endDate: end }))
        .status
    ).toBe(201);

    const overlap = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: addDays(start, 2),
      endDate: addDays(start, 6),
    });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error.code).toBe('conflict');
  });

  it('counts pending days against the entitlement', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType({ entitlement: 2 });
    const { start, end } = week();

    const res = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('insufficient_balance');
    expect(res.body.error.message).toMatch(/Only 2 working day/);
  });

  it('keeps one employee’s application and document private from another employee', async () => {
    const owner = await employee();
    const stranger = await employee();
    const admin = await h.createUser({ role: 'admin' });
    const adminToken = await accessTokenFor(h.app, admin);
    const type = await h.createLeaveType({ requiresDocument: true });
    const { start, end } = week();

    const created = await submitLeaveRequest(
      h.app,
      owner.token,
      { leaveTypeId: type.id, startDate: start, endDate: end },
      PDF_FILE
    );
    expect(created.status).toBe(201);
    const id = created.body.application.id as number;

    const own = await request(h.app)
      .get(`/api/leaves/${id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(own.status).toBe(200);

    const denied = await request(h.app)
      .get(`/api/leaves/${id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(denied.status).toBe(404);

    const deniedDoc = await request(h.app)
      .get(`/api/leaves/${id}/document`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(deniedDoc.status).toBe(404);

    const adminView = await request(h.app)
      .get(`/api/leaves/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminView.status).toBe(200);

    const download = await request(h.app)
      .get(`/api/leaves/${id}/document`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('application/pdf');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['content-disposition']).toContain('medical-certificate.pdf');
    expect(Buffer.from(download.body).subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('lets an admin approve once, rejects a second decision, and requires rejection remarks', async () => {
    const { token } = await employee();
    const admin = await h.createUser({ role: 'admin' });
    const adminToken = await accessTokenFor(h.app, admin);
    const type = await h.createLeaveType({ entitlement: 10 });
    const { start, end } = week();

    const created = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
    });
    const id = created.body.application.id as number;

    const approved = await request(h.app)
      .post(`/api/admin/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved', remarks: 'Approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.application.status).toBe('approved');
    expect(approved.body.application.decidedByName).toBe('Test Person');
    expect(approved.body.application.decidedAt).toEqual(expect.any(String));

    const again = await request(h.app)
      .post(`/api/admin/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'rejected', remarks: 'Too late' });
    expect(again.status).toBe(409);

    const second = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: addDays(start, 7),
      endDate: addDays(start, 7),
    });
    const secondId = second.body.application.id as number;

    const noRemarks = await request(h.app)
      .post(`/api/admin/leaves/${secondId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'rejected' });
    expect(noRemarks.status).toBe(400);
    expect(noRemarks.body.error.fields.remarks).toMatch(/Explain why/i);

    const rejected = await request(h.app)
      .post(`/api/admin/leaves/${secondId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'rejected', remarks: 'Team is at capacity that week.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.application.status).toBe('rejected');
    expect(rejected.body.application.remarks).toBe('Team is at capacity that week.');

    const mine = await request(h.app)
      .get('/api/leaves')
      .query({ status: 'approved' })
      .set('Authorization', `Bearer ${token}`);
    expect(mine.status).toBe(200);
    expect((mine.body.items as Array<{ id: number }>).some((item) => item.id === id)).toBe(true);
  });

  it('blocks approval when the entitlement was lowered below the request', async () => {
    const { token } = await employee();
    const admin = await h.createUser({ role: 'admin' });
    const adminToken = await accessTokenFor(h.app, admin);
    const type = await h.createLeaveType({ entitlement: 5 });
    const { start, end } = week();

    const created = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
    });
    expect(created.status).toBe(201);

    await h.migrator.query('UPDATE leave_types SET yearly_entitlement = 4 WHERE id = ?', [type.id]);

    const res = await request(h.app)
      .post(`/api/admin/leaves/${created.body.application.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/exceed the remaining balance/i);
  });

  it('will not approve a document-required request whose document is gone', async () => {
    const { token } = await employee();
    const admin = await h.createUser({ role: 'admin' });
    const adminToken = await accessTokenFor(h.app, admin);
    const type = await h.createLeaveType({ requiresDocument: true });
    const { start, end } = week();

    const created = await submitLeaveRequest(
      h.app,
      token,
      { leaveTypeId: type.id, startDate: start, endDate: end },
      PDF_FILE
    );
    const id = created.body.application.id as number;
    await h.migrator.query('DELETE FROM documents WHERE application_id = ?', [id]);

    const res = await request(h.app)
      .post(`/api/admin/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approved' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/supporting document/i);
  });

  it('applies the admin role gate to decisions and lists all employees for an admin', async () => {
    const { token } = await employee();
    const admin = await h.createUser({ role: 'admin' });
    const adminToken = await accessTokenFor(h.app, admin);
    const type = await h.createLeaveType();
    const { start, end } = week();

    const created = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
    });
    const id = created.body.application.id as number;

    const forbidden = await request(h.app)
      .post(`/api/admin/leaves/${id}/decision`)
      .set('Authorization', `Bearer ${token}`)
      .send({ decision: 'approved' });
    expect(forbidden.status).toBe(403);

    const list = await request(h.app)
      .get('/api/admin/leaves')
      .query({ status: 'pending', leaveTypeId: type.id })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.items[0]).toHaveProperty('employeeName');
  });

  it('rejects an application that spans two calendar years', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType();
    const nextYear = new Date().getUTCFullYear() + 1;

    const res = await submitLeaveRequest(h.app, token, {
      leaveTypeId: type.id,
      startDate: `${nextYear}-12-31`,
      endDate: `${nextYear + 1}-01-02`,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.endDate).toMatch(/two calendar years/i);
  });

  it('accepts a native-style JSON-free request only as multipart and rejects JSON', async () => {
    const { token } = await employee();
    const type = await h.createLeaveType();
    const { start, end } = week();

    const res = await request(h.app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send({ leaveTypeId: type.id, startDate: start, endDate: end, reason: 'x' });
    expect(res.status).toBe(415);
  });

  it('returns 404 for a missing application and 400 for a non-numeric id', async () => {
    const { token } = await employee();
    const missing = await request(h.app)
      .get('/api/leaves/999999')
      .set('Authorization', `Bearer ${token}`);
    expect(missing.status).toBe(404);

    const invalid = await request(h.app)
      .get('/api/leaves/not-a-number')
      .set('Authorization', `Bearer ${token}`);
    expect(invalid.status).toBe(400);
  });

  it('requires an access token for every leave route', async () => {
    const res = await request(h.app).get('/api/leaves');
    expect(res.status).toBe(401);
  });

  it('still rejects a wrong password after the new routes are mounted', async () => {
    const { user } = await employee();
    const bad = await loginRequest(h.app, user.email, 'WrongPass1234!');
    expect(bad.status).toBe(401);
  });
});
