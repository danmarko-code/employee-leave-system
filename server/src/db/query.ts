import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { DbExecutor } from './pool';

/**
 * The single SQL entry point for the application.
 *
 * Every call takes a constant SQL string plus a parameters array and executes
 * it as a prepared statement. No call site may build SQL with concatenation or
 * template literals; server/scripts/check-sql.mjs fails CI if one tries.
 *
 * mysql2 `execute()` uses the server-side prepared-statement protocol, so
 * values are never interpolated into SQL text.
 */
export async function query<T extends RowDataPacket>(
  db: DbExecutor,
  sql: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  // Cast is confined to this one helper: mysql2's overloads require its own
  // value union, while callers pass a readonly unknown[].
  const [rows] = await (db.execute as unknown as (
    sql: string,
    values: readonly unknown[]
  ) => Promise<[unknown, unknown]>)(sql, params);
  return rows as T[];
}

export async function queryOne<T extends RowDataPacket>(
  db: DbExecutor,
  sql: string,
  params: readonly unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(db, sql, params);
  return rows[0] ?? null;
}

export async function execute(
  db: DbExecutor,
  sql: string,
  params: readonly unknown[] = []
): Promise<ResultSetHeader> {
  const [result] = await (db.execute as unknown as (
    sql: string,
    values: readonly unknown[]
  ) => Promise<[unknown, unknown]>)(sql, params);
  return result as ResultSetHeader;
}

/**
 * Runs a unit of work on one pooled connection with BEGIN/COMMIT/ROLLBACK.
 * Row locks (SELECT ... FOR UPDATE) inside the callback protect balances and
 * one-time decisions.
 */
export async function withTransaction<T>(
  pool: Pool,
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}
