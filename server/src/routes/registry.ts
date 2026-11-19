import type { Express, RequestHandler, Router } from 'express';
import type { Pool } from 'mysql2/promise';
import type { AppConfig } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';

export type RouteMethod = 'get' | 'post' | 'patch' | 'delete';
/** Every route must declare one of these. There is no implicit access. */
export type RouteAccess = 'public' | 'authenticated' | 'employee' | 'admin';

export interface RouteMeta {
  method: RouteMethod;
  path: string;
  access: RouteAccess;
}

export interface RouteDeps {
  config: AppConfig;
  pool: Pool;
}

interface LayerLike {
  route?: { path: string; methods: Record<string, boolean> };
}

function guardsFor(access: RouteAccess, deps: RouteDeps): RequestHandler[] {
  switch (access) {
    case 'public':
      return [];
    case 'authenticated':
      return [requireAuth(deps.config, deps.pool), requireRole(['employee', 'admin'], deps.pool)];
    case 'employee':
      return [requireAuth(deps.config, deps.pool), requireRole(['employee'], deps.pool)];
    case 'admin':
      return [requireAuth(deps.config, deps.pool), requireRole(['admin'], deps.pool)];
    default: {
      const neverAccess: never = access;
      throw new Error(`Unknown route access: ${String(neverAccess)}`);
    }
  }
}

export function addRoute(
  router: Router,
  registry: RouteMeta[],
  deps: RouteDeps,
  definition: RouteMeta & { handlers: RequestHandler[] }
): void {
  const guards = guardsFor(definition.access, deps);
  router[definition.method](definition.path, ...guards, ...definition.handlers);
  registry.push({ method: definition.method, path: definition.path, access: definition.access });
}

function routeLayers(stack: LayerLike[]): LayerLike[] {
  return stack.filter((layer) => Boolean(layer.route));
}

/**
 * Startup guard: refuses to boot if any Express route was registered without
 * going through addRoute (i.e. without an explicit access declaration), or if
 * the router and the declaration registry disagree.
 */
export function assertRoutesDeclared(app: Express, router: Router, registry: RouteMeta[]): void {
  const appStack = ((app as unknown as { router?: { stack: LayerLike[] } }).router?.stack ?? []) as LayerLike[];
  if (routeLayers(appStack).length > 0) {
    throw new Error('A route was registered directly on the app without an access declaration.');
  }

  const routerStack = (router as unknown as { stack: LayerLike[] }).stack ?? [];
  const actual = routeLayers(routerStack);
  if (actual.length !== registry.length) {
    throw new Error(
      `Route declaration mismatch: ${actual.length} Express route(s) but ${registry.length} declared. ` +
        'Register every route through addRoute with an explicit access level.'
    );
  }

  const actualKeys = new Set(
    actual.flatMap((layer) =>
      Object.keys(layer.route?.methods ?? {})
        .filter((method) => method !== '_all')
        .map((method) => `${method.toUpperCase()} ${layer.route?.path ?? ''}`)
    )
  );

  for (const meta of registry) {
    const key = `${meta.method.toUpperCase()} ${meta.path}`;
    if (!actualKeys.has(key)) {
      throw new Error(`Declared route ${key} is missing from the Express router.`);
    }
  }
}
