import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import {
  adminLeaveListQuerySchema,
  idParamSchema,
  leaveDecisionSchema,
} from '@leave/shared';
import { addRoute, type RouteMeta } from './registry';
import { createAdminLeaveController } from '../controllers/adminLeave.controller';
import { validate } from '../middleware/validate';

export function registerAdminLeaveRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createAdminLeaveController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/leaves',
    access: 'admin',
    handlers: [validate({ query: adminLeaveListQuerySchema }), controller.list],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/leaves/:id',
    access: 'admin',
    handlers: [validate({ params: idParamSchema }), controller.get],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/admin/leaves/:id/decision',
    access: 'admin',
    handlers: [
      validate({ params: idParamSchema, body: leaveDecisionSchema }),
      controller.decide,
    ],
  });
}
