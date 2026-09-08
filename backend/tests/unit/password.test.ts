import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../../src/common/utils/password.util.js';

describe('Password Utilities', () => {
  it('should hash password and verify matching password successfully', async () => {
    const rawPassword = 'SecurePassword2026!';
    const hash = await hashPassword(rawPassword);

    expect(typeof hash).toBe('string');
    expect(hash).not.toBe(rawPassword);
    expect(hash.startsWith('$2b$12$')).toBe(true); // 12 rounds bcrypt identifier

    const isMatch = await comparePassword(rawPassword, hash);
    expect(isMatch).toBe(true);
  });

  it('should return false when comparing against incorrect password', async () => {
    const rawPassword = 'CorrectPassword123!';
    const hash = await hashPassword(rawPassword);

    const isMatch = await comparePassword('WrongPassword123!', hash);
    expect(isMatch).toBe(false);
  });
});
