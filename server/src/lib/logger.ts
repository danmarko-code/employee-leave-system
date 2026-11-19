import type { LogLevel } from '../config/env';

let minimumLevel: LogLevel = 'info';
const LEVELS: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3 };
const REDACT_KEY = /(token|password|secret|authorization|cookie|email|reason|phone|hash)/i;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

function clean(value: string, max = 300): string {
  return value.replace(CONTROL_CHARS, ' ').replace(EMAIL_LIKE, '[redacted]').trim().slice(0, max);
}

function safeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEY.test(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = clean(value);
    } else {
      out[key] = '[object]';
    }
  }
  return out;
}

function write(level: Exclude<LogLevel, 'silent'>, event: string, fields: Record<string, unknown>): void {
  if (LEVELS[minimumLevel] < LEVELS[level]) return;
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    event: clean(event, 80),
    ...safeFields(fields),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields: Record<string, unknown> = {}) => write('info', event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) => write('warn', event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) => write('error', event, fields),
};

/** Only low-cardinality error facts; no SQL, parameters or stack traces. */
export function safeErrorFacts(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const facts: Record<string, unknown> = { name: error.name };
    const code = (error as NodeJS.ErrnoException).code;
    if (code) facts.code = String(code).slice(0, 40);
    return facts;
  }
  return { name: 'UnknownError' };
}
