import { hashPassword, passwordPolicyError, verifyDummyPassword, verifyPassword } from '../src/lib/password';

describe('password policy and hashing', () => {
  it('accepts a reasonable password', () => {
    expect(passwordPolicyError('TestPass1234!')).toBeNull();
  });

  it('rejects short, letterless, numberless and overlong passwords', () => {
    expect(passwordPolicyError('Ab1')).toMatch(/at least/i);
    expect(passwordPolicyError('1234567890')).toMatch(/letter/i);
    expect(passwordPolicyError('abcdefghij')).toMatch(/number/i);
    expect(passwordPolicyError(`Aa1${'x'.repeat(140)}`)).toMatch(/128/);
  });

  it('rejects common passwords', () => {
    expect(passwordPolicyError('Password123')).toMatch(/common/i);
  });

  it('hashes with Argon2id and verifies without storing the plaintext', async () => {
    const hash = await hashPassword('TestPass1234!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('TestPass1234!');
    await expect(verifyPassword(hash, 'TestPass1234!')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'WrongPass1234!')).resolves.toBe(false);
  });

  it('treats a malformed hash as a failed verification, not a crash', async () => {
    await expect(verifyPassword('not-a-hash', 'TestPass1234!')).resolves.toBe(false);
  });

  it('runs the dummy hash path for unknown accounts', async () => {
    await expect(verifyDummyPassword('anything123')).resolves.toBeUndefined();
  });
});
