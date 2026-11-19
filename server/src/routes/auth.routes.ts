import type { Router } from 'express';
import { loginSchema } from '@leave/shared';
import type { AppConfig } from '../config/env';
import type { Pool } from 'mysql2/promise';
import { addRoute, type RouteMeta } from './registry';
import { createAuthController } from '../controllers/auth.controller';
import { requireClientType } from '../middleware/clientType';
import { csrfForWeb } from '../middleware/csrf';
import { requireJsonBody } from '../middleware/contentType';
import { loginLimiter, refreshLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';

export function registerAuthRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createAuthController(deps);

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/auth/login',
    access: 'public',
    handlers: [
      requireClientType(),
      csrfForWeb(deps.config),
      requireJsonBody(),
      loginLimiter(deps.config),
      validate({ body: loginSchema }),
      controller.login,
    ],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/auth/refresh',
    access: 'public',
    handlers: [
      requireClientType(),
      csrfForWeb(deps.config),
      refreshLimiter(deps.config),
      controller.refresh,
    ],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/auth/logout',
    access: 'authenticated',
    handlers: [requireClientType(), csrfForWeb(deps.config), controller.logout],
  });
}
