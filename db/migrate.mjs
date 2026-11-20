#!/usr/bin/env node
// ============================================================================
// Applies every pending file in db/migrations, in filename order.
//
//   node db/migrate.mjs
//
// Uses the migration account from server/.env. Each file runs in one
// multi-statement query, and its name is recorded in schema_migrations only
// after it succeeds. Re-running is a no-op.
//
// This script needs multipleStatements because it executes trusted, static
// SQL files. The application runtime never enables it.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, '..', 'server', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;
const migratorUser = env.DB_MIGRATOR_USER || 'leave_migrator';
const migratorPassword = env.DB_MIGRATOR_PASSWORD;
const dbHost = env.DB_HOST || '127.0.0.1';
const dbPort = Number(env.DB_PORT || 3306);
const dbName = env.DB_NAME || 'leave_system';

if (!migratorPassword) {
  console.error('\n[migrate] DB_MIGRATOR_PASSWORD is not set in server/.env.\n');
  process.exit(1);
}

const migrationsDir = path.join(here, 'migrations');
const files = (await readdir(migrationsDir))
  .filter((name) => /^\d{3}_.+\.sql$/.test(name))
  .sort();

const connection = await mysql.createConnection({
  host: dbHost,
  port: dbPort,
  user: migratorUser,
  password: migratorPassword,
  database: dbName,
  charset: 'utf8mb4',
  multipleStatements: true,
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(200) NOT NULL,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
  const applied = new Set(appliedRows.map((row) => row.version));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    await connection.query(sql);
    await connection.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
    console.log(`  apply ${file}`);
    ran += 1;
  }

  console.log(`\n[migrate] ${ran} migration(s) applied, ${files.length - ran} already current.\n`);
} finally {
  await connection.end().catch(() => {});
}
