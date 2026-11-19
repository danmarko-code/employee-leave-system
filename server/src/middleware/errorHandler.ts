import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { logger, safeErrorFacts } from '../lib/logger';

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res.status(404).json({
      error: {
        code: 'not_found',
        message: 'Not found.',
        requestId: req.id ?? 'unknown',
      },
    });
  };
}

/**
 * The only place that turns errors into responses. Known AppErrors use their
 * short public message; everything else becomes a generic 500 with a request
 * id. Stack traces, SQL and driver messages stay in server logs, and even there
 * only name/code are written.
 */
export function errorHandler(): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const requestId = req.id ?? 'unknown';

    if (res.headersSent) return;

    if (err instanceof AppError) {
      if (err.statusCode >= 500) {
        logger.error('request_failed', { requestId, code: err.code, status: err.statusCode });
      }
      res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          requestId,
          ...(err.fields ? { fields: err.fields } : {}),
        },
      });
      return;
    }

    const type = (err as { type?: string } | null)?.type;
    if (type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'invalid_json', message: 'Check the request and try again.', requestId },
      });
      return;
    }
    if (type === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'payload_too_large', message: 'That request is too large.', requestId },
      });
      return;
    }

    logger.error('unhandled_error', { requestId, ...safeErrorFacts(err) });
    res.status(500).json({
      error: { code: 'internal_error', message: 'Something went wrong. Try again.', requestId },
    });
  };
}
