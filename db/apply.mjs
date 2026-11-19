#!/usr/bin/env node
// ============================================================================
// Applies db/schema.sql and db/db-users.sql.
//
//   node db/apply.mjs
//
// Reads configuration from server/.env when present, then from the process
// environment. The administrative MySQL password is never accepted as an
// argument (it would leak into shell history and process lists).
//
// This script is a developer/setup tool. It is the only place in the project
// that enables multipleStatements, because it executes two trusted, static SQL
// files. The application runtime never does.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const envFile = path.join(projectRoot, 'server', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

function fail(message) {
  console.error(`\n[apply] ${message}\n`);
  process.exit(1);
}

// --- connection settings ---------------------------------------------------
const dbHost = env.DB_HOST || '127.0.0.1';
const dbPort = Number(env.DB_PORT || 3306);
const adminUser = env.DB_ADMIN_USER || 'root';
const adminPassword = env.DB_ADMIN_PASSWORD || '';
const userHost = env.DB_USER_HOST || 'localhost';

if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535) fail('DB_PORT is not a valid port.');
if (!/^[A-Za-z0-9._%:-]{1,255}$/.test(dbHost)) fail('DB_HOST contains unexpected characters.');
if (!/^[A-Za-z0-9._%:-]{1,255}$/.test(userHost)) fail('DB_USER_HOST contains unexpected characters.');
if (!adminPassword) {
  fail(
    'DB_ADMIN_PASSWORD is not set. Put it in server/.env (see server/.env.example) ' +
      'or export it for this one command. Do not pass it as a command-line argument.'
  );
}

// --- passwords we generate for the MySQL accounts --------------------------
const accountPasswords = {
  __MIGRATOR_PASSWORD__: env.DB_MIGRATOR_PASSWORD,
  __APP_PASSWORD__: env.DB_APP_PASSWORD,
  __REPORT_PASSWORD__: env.DB_REPORT_PASSWORD,
};

for (const [name, value] of Object.entries(accountPasswords)) {
  if (!value || value.length < 24 || value.length > 100) {
    fail(`${name.replaceAll('_', '')} must be 24-100 characters. Generate one with: node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`);
  }
  if (!/^[\x21-\x7E]+$/.test(value) || value.includes("'") || value.includes('\\')) {
    fail(`${name.replaceAll('_', '')} must be printable ASCII without quotes or backslashes.`);
  }
}

function fillTemplate(text) {
  let out = text;
  for (const [placeholder, value] of Object.entries(accountPasswords)) {
    out = out.replaceAll(placeholder, value);
  }
  return out.replaceAll('__DB_USER_HOST__', userHost);
}

// --- helpers ---------------------------------------------------------------
function ok(label) {
  console.log(`  PASS  ${label}`);
}

let failures = 0;

function failed(label, detail) {
  failures += 1;
  console.error(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`);
}

// Denial errors we accept as proof the grant is missing.
const DENIED = new Set([1044, 1141, 1142, 1143, 1227]);

async function expectDenied(conn, label, sql) {
  try {
    await conn.query(sql);
    failed(label, 'statement unexpectedly succeeded');
  } catch (err) {
    if (DENIED.has(err.errno)) ok(label);
    else failed(label, `${err.code || 'unknown'}: ${err.message}`);
  }
}

async function expectAllowed(conn, label, sql) {
  try {
    await conn.query(sql);
    ok(label);
  } catch (err) {
    failed(label, `${err.code || 'unknown'}: ${err.message}`);
  }
}

// --- apply -----------------------------------------------------------------
let adminConn;
try {
  adminConn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: adminUser,
    password: adminPassword,
    charset: 'utf8mb4',
    multipleStatements: true,
  });
} catch (err) {
  fail(`Could not connect to MySQL as ${adminUser}@${dbHost}:${dbPort} (${err.code || err.message}).`);
}

try {
  console.log('\n[apply] schema.sql');
  const schemaSql = await readFile(path.join(here, 'schema.sql'), 'utf8');
  await adminConn.query(schemaSql);
  console.log('  schema applied');

  console.log('[apply] db-users.sql');
  const dbUsersSql = fillTemplate(await readFile(path.join(here, 'db-users.sql'), 'utf8'));
  await adminConn.query(dbUsersSql);
  console.log('  MySQL accounts created or rotated');

  const [grantRows] = await adminConn.query(
    `SELECT COUNT(*) AS accounts
       FROM mysql.user
      WHERE user IN ('leave_migrator', 'leave_app', 'leave_report')
        AND host = ?`,
    [userHost]
  );
  console.log(`  MySQL accounts present: ${grantRows[0]?.accounts ?? 0}/3`);
} finally {
  await adminConn.end().catch(() => {});
}

// --- verify the grants actually deny what they should ----------------------
console.log('\n[apply] verifying least privilege (logging in as each account)');

let appConn;
try {
  appConn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: 'leave_app',
    password: env.DB_APP_PASSWORD,
    database: 'leave_system',
    charset: 'utf8mb4',
  });

  await expectAllowed(appConn, 'leave_app can read applications', 'SELECT COUNT(*) FROM leave_applications');
  try {
    await appConn.beginTransaction();
    await appConn.query("INSERT INTO activity_logs (action) VALUES ('privilege_check')");
    await appConn.rollback();
    ok('leave_app can append an activity log (rolled back)');
  } catch (err) {
    await appConn.rollback().catch(() => {});
    failed('leave_app can append an activity log', `${err.code || err.message}`);
  }
  await expectDenied(appConn, 'leave_app cannot DELETE activity_logs', 'DELETE FROM activity_logs WHERE id = 0');
  await expectDenied(appConn, 'leave_app cannot UPDATE activity_logs', "UPDATE activity_logs SET action = 'x' WHERE id = 0");
  await expectDenied(appConn, 'leave_app cannot DELETE users', 'DELETE FROM users WHERE id = 0');
  await expectDenied(appConn, 'leave_app cannot DELETE applications', 'DELETE FROM leave_applications WHERE id = 0');
  await expectDenied(appConn, 'leave_app cannot DROP tables', 'DROP TABLE users');
  await expectDenied(appConn, 'leave_app cannot create MySQL users', "CREATE USER 'leave_escalate'@'localhost' IDENTIFIED BY 'x'");
} catch (err) {
  failed('leave_app verification connection', `${err.code || err.message}`);
} finally {
  await appConn?.end().catch(() => {});
}

let reportConn;
try {
  reportConn = await mysql.createConnection({
    host: dbHost,
    port: dbPort,
    user: 'leave_report',
    password: env.DB_REPORT_PASSWORD,
    database: 'leave_system',
    charset: 'utf8mb4',
  });

  await expectAllowed(reportConn, 'leave_report can read report columns', 'SELECT id, name FROM users LIMIT 1');
  await expectAllowed(reportConn, 'leave_report can read applications', 'SELECT COUNT(*) FROM leave_applications');
  await expectDenied(reportConn, 'leave_report cannot read password_hash', 'SELECT password_hash FROM users LIMIT 1');
  await expectDenied(reportConn, 'leave_report cannot write activity_logs', "INSERT INTO activity_logs (action) VALUES ('x')");
} catch (err) {
  failed('leave_report verification connection', `${err.code || err.message}`);
} finally {
  await reportConn?.end().catch(() => {});
}

if (failures > 0) {
  fail(`${failures} least-privilege check(s) failed. Inspect the grant output above before running the server.`);
}

console.log('\n[apply] done. Least-privilege checks passed.');
console.log('[apply] Next: NODE_ENV=development node db/seed.mjs\n');
