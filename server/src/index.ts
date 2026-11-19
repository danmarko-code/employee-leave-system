import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config/env';
import { createPool, pingDatabase } from './db/pool';
import { createApp } from './app';
import { logger, safeErrorFacts } from './lib/logger';
import { warmPasswordHasher } from './lib/password';

const envFile = path.resolve(__dirname, '..', '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config);

  try {
    await pingDatabase(pool);
  } catch {
    logger.error('startup_db_unreachable', { host: config.db.host, port: config.db.port });
    await pool.end().catch(() => undefined);
    process.exit(1);
  }

  // Pay the Argon2 dummy-hash cost before the first login, not during it.
  await warmPasswordHasher();

  const app = createApp(config, pool);
  const server = app.listen(config.port, () => {
    logger.info('server_started', { port: config.port, env: config.nodeEnv });
  });

  const shutdown = (signal: string): void => {
    logger.info('server_stopping', { signal });
    server.close(() => {
      pool
        .end()
        .catch((error: unknown) => logger.error('db_close_failed', safeErrorFacts(error)))
        .finally(() => process.exit(0));
    });
    // Do not hang forever on stuck connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  logger.error('startup_failed', safeErrorFacts(error));
  // Configuration errors are safe to print: they contain rule text, not values.
  if (error instanceof Error) console.error(error.message);
  process.exit(1);
});
