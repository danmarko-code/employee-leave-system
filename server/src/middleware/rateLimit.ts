import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config/env';

function limiter(config: AppConfig, limit: number): RequestHandler {
  return rateLimit({
    windowMs: config.rateLimits.windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Try again later.',
          requestId: req.id ?? 'unknown',
        },
      });
    },
  });
}

/** Lenient global guard for the whole API. */
export function globalLimiter(config: AppConfig): RequestHandler {
  return limiter(config, config.rateLimits.globalMax);
}

/** Strict guard on credential endpoints, per client IP. */
export function loginLimiter(config: AppConfig): RequestHandler {
  return limiter(config, config.rateLimits.loginMax);
}

export function refreshLimiter(config: AppConfig): RequestHandler {
  return limiter(config, config.rateLimits.refreshMax);
}
