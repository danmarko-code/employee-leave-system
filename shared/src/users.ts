import { z } from 'zod';
import { LIMITS, ROLES } from './constants';
import { emailSchema, idSchema, phoneSchema } from './validation';

/** Password rules that need no hashing. The server applies the full policy. */
export const newPasswordSchema = z
  .string()
  .min(LIMITS.passwordMin, `Use at least ${LIMITS.passwordMin} characters.`)
  .max(LIMITS.passwordMax, `Use ${LIMITS.passwordMax} characters or fewer.`);

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const adminUserCreateSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter a name.').max(LIMITS.name),
  email: emailSchema,
  password: newPasswordSchema,
  role: z.enum(ROLES),
  position: optionalText(100),
  department: optionalText(100),
  phone: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    phoneSchema.nullable().optional()
  ),
  isActive: z.boolean().default(true),
});

export const adminUserUpdateSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Enter a name.').max(LIMITS.name).optional(),
    role: z.enum(ROLES).optional(),
    position: optionalText(100),
    department: optionalText(100),
    phone: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      phoneSchema.nullable().optional()
    ),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });

export const adminPasswordResetSchema = z.strictObject({
  password: newPasswordSchema,
});

export const adminUserListQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(25),
  q: z.string().trim().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const userIdParamSchema = z.strictObject({ id: idSchema });

export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminPasswordResetInput = z.infer<typeof adminPasswordResetSchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;

export interface AdminUserDto {
  id: number;
  name: string;
  email: string;
  role: (typeof ROLES)[number];
  position: string;
  department: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}
