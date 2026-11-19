import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from './config/env';
import { setLogLevel } from './lib/logger';
import { requestContext } from './middleware/requestContext';
import { rejectPrototypePollution } from './middleware/prototypePollution';
import { requireHttps } from './middleware/csrf';
import { globalLimiter } from './middleware/rateLimit';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { createApiRouter } from './routes';
import { assertRoutesDeclared } from './routes/registry';

export function createApp(config: AppConfig, pool: Pool): Express {
  setLogLevel(config.logLevel);

  const app = express();
  app.disable('x-powered-by');
  app.disable('etag');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      crossOriginOpenerPolicy: { policy: 'same-origin' },
      hsts: config.isProduction
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    })
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // No Origin header (native app, curl): no CORS headers needed.
        if (!origin) return callback(null, false);
        return callback(null, config.corsOrigins.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client', 'X-Requested-With', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
      optionsSuccessStatus: 204,
    })
  );

  app.use(requestContext());
  app.use(express.json({ limit: '32kb', strict: true }));
  app.use(cookieParser());
  app.use(rejectPrototypePollution());
  app.use(requireHttps(config));

  const { router, registry } = createApiRouter({ config, pool });
  app.use('/api', globalLimiter(config), router);

  app.use(notFoundHandler());
  app.use(errorHandler());

  assertRoutesDeclared(app, router, registry);

  return app;
}
