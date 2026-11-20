import { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import type { RouteMeta } from './registry';
import { registerAuthRoutes } from './auth.routes';
import { registerMeRoutes } from './me.routes';
import { registerAdminRoutes } from './admin.routes';
import { registerLeaveRoutes } from './leaves.routes';
import { registerAdminLeaveRoutes } from './adminLeaves.routes';
import { registerAdminUserRoutes } from './adminUsers.routes';
import { registerAdminLeaveTypeRoutes } from './adminLeaveTypes.routes';
import { registerUserRoutes } from './users.routes';
import { registerReportRoutes } from './reports.routes';

export function createApiRouter(deps: { config: AppConfig; pool: Pool }): {
  router: Router;
  registry: RouteMeta[];
} {
  const router = Router();
  const registry: RouteMeta[] = [];

  registerAuthRoutes(router, registry, deps);
  registerMeRoutes(router, registry, deps);
  registerUserRoutes(router, registry, deps);
  registerLeaveRoutes(router, registry, deps);
  registerAdminRoutes(router, registry, deps);
  registerAdminLeaveRoutes(router, registry, deps);
  registerAdminUserRoutes(router, registry, deps);
  registerAdminLeaveTypeRoutes(router, registry, deps);
  registerReportRoutes(router, registry, deps);

  return { router, registry };
}
