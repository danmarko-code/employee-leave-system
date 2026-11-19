import express, { Router, type RequestHandler } from 'express';
import { addRoute, assertRoutesDeclared, type RouteMeta } from '../src/routes/registry';
import { testConfig } from './helpers';

const handler: RequestHandler = (_req, _res) => undefined;

describe('deny-by-default route registry', () => {
  it('throws when a route is registered without an access declaration', () => {
    const app = express();
    const router = Router();
    router.get('/sneaky', handler);

    expect(() => assertRoutesDeclared(app, router, [])).toThrow(/explicit access/);
  });

  it('throws when a route is registered directly on the app', () => {
    const app = express();
    app.get('/direct', handler);
    const router = Router();

    expect(() => assertRoutesDeclared(app, router, [])).toThrow(/directly on the app/);
  });

  it('accepts a router built entirely through addRoute', () => {
    const app = express();
    const router = Router();
    const registry: RouteMeta[] = [];
    const deps = { config: testConfig(), pool: {} as never };

    addRoute(router, registry, deps, { method: 'get', path: '/public', access: 'public', handlers: [handler] });
    expect(registry).toEqual([{ method: 'get', path: '/public', access: 'public' }]);
    expect(() => assertRoutesDeclared(app, router, registry)).not.toThrow();
  });
});
