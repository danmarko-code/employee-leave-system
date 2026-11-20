import { z } from 'zod';
import { ACTIVITY_ACTIONS, LIMITS } from './constants';
import { isoDateTimeSchema } from './validation';

export const activityQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(25),
    action: z.enum(ACTIVITY_ACTIONS).optional(),
    userId: z.coerce.number().int().positive().optional(),
    from: isoDateTimeSchema.optional(),
    to: isoDateTimeSchema.optional(),
    format: z.enum(['json', 'csv']).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'The start of the range must be before the end.',
    path: ['from'],
  });

export type ActivityQuery = z.infer<typeof activityQuerySchema>;
