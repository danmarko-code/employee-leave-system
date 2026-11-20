import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import { addRoute, type RouteMeta } from './registry';
import { validate } from '../middleware/validate';
import { idParamSchema, holidayCreateSchema } from '@leave/shared';
import { createHolidayController } from '../controllers/adminHoliday.controller';

export function registerAdminHolidayRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createHolidayController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/holidays',
    access: 'admin',
    handlers: [controller.list],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/holidays/:id',
    access: 'admin',
    handlers: [validate({ params: idParamSchema }), controller.get],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/admin/holidays',
    access: 'admin',
    handlers: [validate({ body: holidayCreateSchema }), controller.create],
  });

  addRoute(router, registry, deps, {
    method: 'delete',
    path: '/admin/holidays/:id',
    access: 'admin',
    handlers: [validate({ params: idParamSchema }), controller.delete],
  });
}
