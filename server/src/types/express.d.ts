import type { ClientType, Role } from '@leave/shared';

declare global {
  namespace Express {
    interface Request {
      /** Generated per request; echoed as X-Request-Id and used in errors. */
      id: string;
      /** Set only by requireAuth after checking the session in the database. */
      auth?: {
        userId: number;
        role: Role;
        sessionId: string;
      };
      clientType?: ClientType;
      /** Output of the zod schemas, so controllers never re-parse raw input. */
      valid?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
