#!/usr/bin/env node
// ============================================================================
// Seeds development demo data (never production).
//
//   NODE_ENV=development node db/seed.mjs
//   NODE_ENV=development node db/seed.mjs --rotate   # reset demo passwords
//
// Passwords are hashed here with Argon2id (same parameters the API uses) and
// printed ONCE. Re-running without --rotate refuses to touch existing accounts
// so the printed passwords always match what is in the database.
//
// Requires the migration account (default leave_migrator) and CREATE TEMPORARY
// TABLES, which db-users.sql grants.
// ============================================================================

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import mysql from 'mysql2/promise';
import argon2 from 'argon2';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const envFile = path.join(projectRoot, 'server', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const rotate = process.argv.includes('--rotate');

// --- fail-closed guards ----------------------------------------------------
if (env.NODE_ENV !== 'development') {
  console.error(
    `\n[seed] Refusing to run: NODE_ENV is "${env.NODE_ENV ?? 'unset'}". ` +
      'Seeding is allowed only with NODE_ENV=development.\n'
  );
  process.exit(1);
}

const migratorUser = env.DB_MIGRATOR_USER || 'leave_migrator';
const migratorPassword = env.DB_MIGRATOR_PASSWORD;
if (!migratorPassword) {
  console.error('\n[seed] DB_MIGRATOR_PASSWORD is not set. See server/.env.example.\n');
  process.exit(1);
}

// Argon2id, OWASP-recommended minimum profile. The API must use these exact
// parameters so hashes remain verifiable in one place.
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

const SEED_USERS = [
  { email: 'linda.cruz@example.com', role: 'admin', placeholder: 'admin_hash' },
  { email: 'maria.santos@example.com', role: 'employee', placeholder: 'maria_hash' },
  { email: 'ana.lim@example.com', role: 'employee', placeholder: 'ana_hash' },
  { email: 'david.reyes@example.com', role: 'employee', placeholder: 'david_hash' },
  { email: 'carla.dizon@example.com', role: 'employee', placeholder: 'carla_hash' },
];

function fail(message) {
  console.error(`\n[seed] ${message}\n`);
  process.exit(1);
}

// --- password generation ---------------------------------------------------
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

function pick(chars) {
  return chars[randomInt(0, chars.length)];
}

function generatePassword(length = 20) {
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: length - required.length }, () => pick(ALL));
  const all = [...required, ...rest];
  // Fisher-Yates with crypto randomness.
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.join('');
}

function assertPasswordPolicy(password, label) {
  if (password.length < 12 || password.length > 128) fail(`${label} must be 12-128 characters.`);
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) fail(`${label} needs a letter and a number.`);
}

// --- run -------------------------------------------------------------------
let conn;
try {
  conn = await mysql.createConnection({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: migratorUser,
    password: migratorPassword,
    database: 'leave_system',
    charset: 'utf8mb4',
    namedPlaceholders: true,
  });
} catch (err) {
  fail(`Could not connect as ${migratorUser} (${err.code || err.message}). Run db/apply.mjs first.`);
}

try {
  const emails = SEED_USERS.map((u) => u.email);
  const [existingRows] = await conn.query(
    'SELECT email FROM users WHERE email IN (?)',
    [emails]
  );
  const existing = new Set(existingRows.map((r) => r.email));

  if (existing.size > 0 && !rotate) {
    fail(
      `Seed accounts already exist (${existing.size}). Nothing was changed, and no passwords were printed. ` +
        'Use --rotate to issue new passwords for the demo accounts, or remove them manually as leave_migrator.'
    );
  }

  const adminPassword = env.SEED_ADMIN_PASSWORD || generatePassword();
  assertPasswordPolicy(adminPassword, 'SEED_ADMIN_PASSWORD');

  const passwords = new Map();
  passwords.set('linda.cruz@example.com', {
    password: adminPassword,
    fromEnv: Boolean(env.SEED_ADMIN_PASSWORD),
  });
  for (const user of SEED_USERS) {
    if (user.email === 'linda.cruz@example.com') continue;
    passwords.set(user.email, { password: generatePassword(), fromEnv: false });
  }

  const params = { node_env: env.NODE_ENV };
  for (const user of SEED_USERS) {
    const { password } = passwords.get(user.email);
    params[user.placeholder] = await argon2.hash(password, ARGON2_OPTIONS);
  }

  const seedSql = await readFile(path.join(here, 'seed.sql'), 'utf8');
  const statements = seedSql
    .split(/^-- @stmt$/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await conn.query(statement, params);
  }

  if (rotate && existing.size > 0) {
    for (const user of SEED_USERS) {
      if (!existing.has(user.email)) continue;
      await conn.query(
        `UPDATE users
            SET password_hash = :hash,
                failed_attempts = 0,
                locked_until = NULL,
                password_changed_at = UTC_TIMESTAMP()
          WHERE email = :email`,
        { hash: params[user.placeholder], email: user.email }
      );
    }
    // A password change revokes sessions; seeded accounts have none, but this
    // keeps the invariant true if a demo account was ever signed in.
    await conn.query(
      `UPDATE refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
          SET rt.revoked_at = UTC_TIMESTAMP()
        WHERE u.email IN (?) AND rt.revoked_at IS NULL`,
      [emails]
    );
  }

  const [[counts]] = await conn.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE email IN (?)) AS users,
       (SELECT COUNT(*) FROM leave_types) AS leave_types`,
    [emails]
  );

  console.log(`\n[seed] Applied as ${migratorUser}. Users: ${counts.users}/5, leave types: ${counts.leave_types}.`);
  console.log('[seed] Passwords below are shown ONCE and are not stored anywhere.\n');
  for (const user of SEED_USERS) {
    const entry = passwords.get(user.email);
    const suffix = entry.fromEnv ? '  (from SEED_ADMIN_PASSWORD)' : '';
    console.log(`  ${user.email.padEnd(30)} ${entry.password}${suffix}`);
  }
  console.log('\n[seed] Store them in a password manager, then clear this terminal.\n');
} finally {
  await conn?.end().catch(() => {});
}
