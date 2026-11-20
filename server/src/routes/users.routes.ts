import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import { idParamSchema } from '@leave/shared';
import type { AppConfig } from '../config/env';
import { addRoute, type RouteMeta } from './registry';
import { createPhotoController, photoQuerySchema } from '../controllers/photo.controller';
import { validate } from '../middleware/validate';

export function registerUserRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createPhotoController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/users/:id/photo',
    access: 'authenticated',
    handlers: [validate({ params: idParamSchema, query: photoQuerySchema }), controller.get],
  });

  addRoute(router, registry, deps, {
    method: 'delete',
    path: '/admin/users/:id/photo',
    access: 'admin',
    handlers: [validate({ params: idParamSchema }), controller.removeForUser],
  });
}
