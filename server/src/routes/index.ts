import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import type { RouteMeta } from './registry';
import { registerAuthRoutes } from './auth.routes';
import { registerMeRoutes } from './me.routes';
import { registerAdminRoutes } from './admin.routes';

export function createApiRouter(deps: { config: AppConfig; pool: Pool }): {
  router: Router;
  registry: RouteMeta[];
} {
  const router = Router();
  const registry: RouteMeta[] = [];

  registerAuthRoutes(router, registry, deps);
  registerMeRoutes(router, registry, deps);
  registerAdminRoutes(router, registry, deps);

  return { router, registry };
}
