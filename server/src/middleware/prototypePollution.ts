import type { RequestHandler } from 'express';
import { badRequest } from '../lib/errors';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function scan(value: unknown, depth: number): boolean {
  if (depth > 6 || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) {
    if (value.length > 100) return true;
    return value.some((item) => scan(item, depth + 1));
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length > 100) return true;
  for (const key of keys) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (scan(record[key], depth + 1)) return true;
  }
  return false;
}

/**
 * Rejects prototype-pollution keys in any input. zod's .strict() already
 * rejects unknown keys; this is a second, explicit barrier.
 */
export function rejectPrototypePollution(): RequestHandler {
  return (req, _res, next) => {
    if (scan(req.body, 0) || scan(req.query, 0) || scan(req.params, 0)) {
      next(badRequest('Check the request and try again.'));
      return;
    }
    next();
  };
}
