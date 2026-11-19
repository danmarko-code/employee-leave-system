import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import { activityQuerySchema } from '@leave/shared';
import type { AppConfig } from '../config/env';
import { addRoute, type RouteMeta } from './registry';
import { createAdminController } from '../controllers/admin.controller';
import { validate } from '../middleware/validate';

export function registerAdminRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createAdminController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/activity-logs',
    access: 'admin',
    handlers: [validate({ query: activityQuerySchema }), controller.activityLogs],
  });
}
