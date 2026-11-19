import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import { idParamSchema, leaveTypeCreateSchema, leaveTypeUpdateSchema } from '@leave/shared';
import { addRoute, type RouteMeta } from './registry';
import { createAdminLeaveTypeController } from '../controllers/adminLeaveType.controller';
import { requireJsonBody } from '../middleware/contentType';
import { validate } from '../middleware/validate';

export function registerAdminLeaveTypeRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createAdminLeaveTypeController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/leave-types',
    access: 'admin',
    handlers: [controller.list],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/admin/leave-types',
    access: 'admin',
    handlers: [requireJsonBody(), validate({ body: leaveTypeCreateSchema }), controller.create],
  });

  addRoute(router, registry, deps, {
    method: 'patch',
    path: '/admin/leave-types/:id',
    access: 'admin',
    handlers: [
      requireJsonBody(),
      validate({ params: idParamSchema, body: leaveTypeUpdateSchema }),
      controller.update,
    ],
  });
}
