import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import { applicationsReportQuerySchema, summaryReportQuerySchema } from '@leave/shared';
import { addRoute, type RouteMeta } from './registry';
import { createReportController } from '../controllers/report.controller';
import { validate } from '../middleware/validate';

export function registerReportRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createReportController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/dashboard',
    access: 'admin',
    handlers: [controller.dashboard],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/reports/leave-summary',
    access: 'admin',
    handlers: [validate({ query: summaryReportQuerySchema }), controller.summary],
  });

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/admin/reports/applications',
    access: 'admin',
    handlers: [validate({ query: applicationsReportQuerySchema }), controller.applications],
  });
}
