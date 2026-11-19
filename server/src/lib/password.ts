import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { LIMITS } from '@leave/shared';

/** OWASP-recommended Argon2id profile. Keep in sync with db/seed.mjs. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

// Small denylist of very common passwords. Not a substitute for the length
// rule, just a cheap rejection for the worst offenders. Compared lowercased.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  'passw0rd', 'p@ssw0rd', 'p@ssword1', 'letmein1', 'letmein123',
  'qwerty12', 'qwerty123', 'qwerty1234', 'qwertyuiop1', 'admin123',
  'admin1234', 'administrator1', 'welcome1', 'welcome12', 'welcome123',
  'iloveyou1', 'iloveyou12', 'monkey123', 'dragon123', 'football1',
  'baseball1', 'sunshine1', 'princess1', 'superman1', 'trustno1',
  'abc12345', 'abcd1234', '12345678', '123456789', '1234567890',
  '11111111', '00000000', 'changeme1', 'changeme123', 'secret123',
  'company123', 'employee1', 'leave1234', 'maria1234', 'linda1234',
]);

/**
 * Returns a human-readable message when the password is not allowed, or null.
 * Used when an administrator creates an account or resets a password.
 */
export function passwordPolicyError(password: string): string | null {
  if (typeof password !== 'string' || password.length === 0) return 'Enter a password.';
  if (password.length < LIMITS.passwordMin) return `Use at least ${LIMITS.passwordMin} characters.`;
  if (password.length > LIMITS.passwordMax) return `Use ${LIMITS.passwordMax} characters or fewer.`;
  if (!/[A-Za-z]/.test(password)) return 'Include at least one letter.';
  if (!/[0-9]/.test(password)) return 'Include at least one number.';
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return 'Choose a less common password.';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** argon2.verify is constant-time internally and never throws to the caller. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | null = null;

/**
 * Verifies against a throwaway hash so a request for an unknown email costs the
 * same as a wrong password. The hash is computed once per process.
 */
export async function verifyDummyPassword(password: string): Promise<void> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(randomBytes(24).toString('base64url'), ARGON2_OPTIONS);
  }
  const hash = await dummyHashPromise;
  await verifyPassword(hash, password);
}

/** Called at startup so the first unknown-email login does not pay extra cost. */
export async function warmPasswordHasher(): Promise<void> {
  if (!dummyHashPromise) {
    dummyHashPromise = argon2.hash(randomBytes(24).toString('base64url'), ARGON2_OPTIONS);
  }
  await dummyHashPromise;
}
