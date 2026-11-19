import { z } from 'zod';
import { CLIENT_TYPES } from './constants';
import { emailSchema, loginPasswordSchema, phoneSchema } from './validation';

export const clientTypeSchema = z.enum(CLIENT_TYPES);

/** Sign in. Unknown fields are rejected, not ignored. */
export const loginSchema = z
  .object({
    email: emailSchema,
    password: loginPasswordSchema,
  })
  .strict();

/**
 * Native refresh/logout payload. Web clients never send a token in the body;
 * the server ignores this field for them and reads the httpOnly cookie.
 */
export const refreshTokenSchema = z
  .object({
    refreshToken: z.string().min(32, 'Refresh token is required.').max(256, 'Refresh token is invalid.'),
  })
  .strict();

/** The only editable profile field for an employee (and an admin). */
export const updateProfileSchema = z
  .object({
    phone: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      phoneSchema.nullable()
    ),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
