import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'silent';

/**
 * Jest's node environment gives each test file a sandboxed copy of
 * process.env, and Node's process.loadEnvFile() writes to the real object,
 * so its values never reach the test. This small parser assigns straight to
 * process.env and never overrides a value already set by the shell.
 */
function loadEnvFile(file: string): void {
  const text = readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const envFile = path.resolve(__dirname, '..', '.env');
if (existsSync(envFile)) loadEnvFile(envFile);
