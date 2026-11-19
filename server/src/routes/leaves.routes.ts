import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import {
  balanceQuerySchema,
  idParamSchema,
  leaveCreateSchema,
  leaveListQuerySchema,
} from '@leave/shared';
import { addRoute, type RouteMeta } from './registry';
import { createLeaveController } from '../controllers/leave.controller';
import { requireMultipart, singleDocument } from '../middleware/upload';
import { rejectPollutedBody } from '../middleware/prototypePollution';
import { validate } from '../middleware/validate';

export function registerLeaveRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createLeaveController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/leave-types',
    access: 'authenticated',
    handlers: [controller.types],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/leave-balances',
    access: 'authenticated',
    handlers: [validate({ query: balanceQuerySchema }), controller.balances],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/leaves',
    access: 'authenticated',
    handlers: [validate({ query: leaveListQuerySchema }), controller.list],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/leaves',
    access: 'employee',
    handlers: [
      requireMultipart(),
      singleDocument(),
      rejectPollutedBody(),
      validate({ body: leaveCreateSchema }),
      controller.create,
    ],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/leaves/:id/document',
    access: 'authenticated',
    handlers: [validate({ params: idParamSchema }), controller.document],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/leaves/:id',
    access: 'authenticated',
    handlers: [validate({ params: idParamSchema }), controller.get],
  });
}
