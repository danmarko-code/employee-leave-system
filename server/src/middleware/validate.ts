import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { invalidInput } from '../lib/errors';

type Part = 'body' | 'query' | 'params';

/**
 * Validates body/query/params against strict zod schemas. Unknown fields are
 * errors, values are trimmed/normalised, and the parsed result is stored on
 * req.valid so the controller cannot accidentally use the raw input.
 */
export function validate(schemas: Partial<Record<Part, z.ZodType>>): RequestHandler {
  return (req, _res, next) => {
    const fields: Record<string, string> = {};
    const parsed: NonNullable<typeof req.valid> = { ...(req.valid ?? {}) };

    for (const part of Object.keys(schemas) as Part[]) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const key = issue.path.length > 0 ? issue.path.join('.') : part;
          if (Object.keys(fields).length < 20 && !fields[key]) {
            fields[key] = issue.message.slice(0, 140);
          }
        }
        continue;
      }
      parsed[part] = result.data;
    }

    req.valid = parsed;

    if (Object.keys(fields).length > 0) {
      next(invalidInput(fields));
      return;
    }
    next();
  };
}

export function validBody<T>(req: Express.Request): T {
  return req.valid?.body as T;
}

export function validQuery<T>(req: Express.Request): T {
  return req.valid?.query as T;
}

export function validParams<T>(req: Express.Request): T {
  return req.valid?.params as T;
}
