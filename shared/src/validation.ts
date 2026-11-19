import { z } from 'zod';
import { LIMITS } from './constants';

/** Positive database id, accepted as number or numeric string. */
export const idSchema = z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter your email address.')
  .max(LIMITS.email, `Email must be ${LIMITS.email} characters or fewer.`)
  .email('Enter a valid email address.');

/** Login only checks presence and length; the policy is for account creation. */
export const loginPasswordSchema = z
  .string()
  .min(1, 'Enter your password.')
  .max(LIMITS.passwordMax, `Password must be ${LIMITS.passwordMax} characters or fewer.`);

export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number.')
  .max(LIMITS.phone, `Phone must be ${LIMITS.phone} characters or fewer.`)
  .regex(/^[0-9+()\-.\s]+$/, 'Use digits, spaces and + ( ) - . only.');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a real date.');

export const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true, message: 'Use an ISO 8601 timestamp with a timezone.' });
