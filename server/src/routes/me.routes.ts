import type { Router } from 'express';
import type { Pool } from 'mysql2/promise';
import { updateProfileSchema } from '@leave/shared';
import type { AppConfig } from '../config/env';
import { addRoute, type RouteMeta } from './registry';
import { createMeController } from '../controllers/me.controller';
import { createPhotoController } from '../controllers/photo.controller';
import { requireJsonBody } from '../middleware/contentType';
import { photoUploadLimiter } from '../middleware/rateLimit';
import { singlePhoto, requireMultipart } from '../middleware/upload';
import { validate } from '../middleware/validate';

export function registerMeRoutes(
  router: Router,
  registry: RouteMeta[],
  deps: { config: AppConfig; pool: Pool }
): void {
  const controller = createMeController(deps);
  const photo = createPhotoController(deps);

  addRoute(router, registry, deps, {
    method: 'get',
    path: '/me',
    access: 'authenticated',
    handlers: [controller.get],
  });

  addRoute(router, registry, deps, {
    method: 'patch',
    path: '/me',
    access: 'authenticated',
    handlers: [requireJsonBody(), validate({ body: updateProfileSchema }), controller.update],
  });

  addRoute(router, registry, deps, {
    method: 'post',
    path: '/me/photo',
    access: 'authenticated',
    handlers: [
      photoUploadLimiter(deps.config),
      requireMultipart('one image'),
      singlePhoto(),
      photo.upload,
    ],
  });

  addRoute(router, registry, deps, {
    method: 'delete',
    path: '/me/photo',
    access: 'authenticated',
    handlers: [photo.removeOwn],
  });
}
