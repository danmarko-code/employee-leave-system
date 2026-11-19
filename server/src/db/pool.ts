import mysql, { type Pool, type PoolConnection } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import { logger, safeErrorFacts } from '../lib/logger';

export type DbExecutor = Pool | PoolConnection;

export function createPool(config: AppConfig): Pool {
  const pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    // Never allow stacked statements, not even defensively.
    multipleStatements: false,
  });

  pool.on('connection', (connection) => {
    connection.on('error', (error) => logger.error('db_connection_error', safeErrorFacts(error)));
  });

  return pool;
}

export async function pingDatabase(pool: Pool): Promise<void> {
  await pool.query('SELECT 1');
}
