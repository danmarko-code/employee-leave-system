import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger';

/**
 * Adds a request id, forbids caching of API responses, and writes one access
 * log line per request. The URL is never logged (query strings can hold search
 * text); only the matched route pattern is used.
 */
export function requestContext(): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID();
    req.id = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');

    const startedAt = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.route?.path ?? 'unmatched',
        status: res.statusCode,
        durationMs: Math.round(durationMs),
        userId: req.auth?.userId,
      });
    });

    next();
  };
}
