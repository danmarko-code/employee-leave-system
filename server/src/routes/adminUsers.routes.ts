import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import {
  adminPasswordResetSchema,
  adminUserCreateSchema,
  adminUserListQuerySchema,
  adminUserUpdateSchema,
  idParamSchema,
} from '@leave/shared';
import { addRoute, type RouteMeta } from './registry';
import { createAdminUserController } from '../controllers/adminUser.controller';
import { requireJsonBody } from '../middleware/contentType';
import { validate } from '../middleware/validate';

export function registerAdminUserRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createAdminUserController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/users',
    access: 'admin',
    handlers: [validate({ query: adminUserListQuerySchema }), controller.list],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/admin/users',
    access: 'admin',
    handlers: [requireJsonBody(), validate({ body: adminUserCreateSchema }), controller.create],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/users/:id',
    access: 'admin',
    handlers: [validate({ params: idParamSchema }), controller.get],
  });

  addRoute(router, registry, deps, {
    method: 'patch',
    path: '/admin/users/:id',
    access: 'admin',
    handlers: [
      requireJsonBody(),
      validate({ params: idParamSchema, body: adminUserUpdateSchema }),
      controller.update,
    ],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/admin/users/:id/reset-password',
    access: 'admin',
    handlers: [
      requireJsonBody(),
      validate({ params: idParamSchema, body: adminPasswordResetSchema }),
      controller.resetPassword,
    ],
  });
}
