import { describe, it, expect } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashToken,
} from '../../src/common/utils/token.util.js';
import { Role } from '@prisma/client';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';

describe('Token Utilities', () => {
  it('should sign and verify a valid JWT access token', () => {
    const payload = {
      userId: 'user_123',
      email: 'test@example.com',
      role: Role.ADMIN,
    };

    const token = signAccessToken(payload);
    expect(typeof token).toBe('string');

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it('should throw UnauthorizedError when verifying an invalid token', () => {
    expect(() => verifyAccessToken('invalid.token.signature')).toThrow(UnauthorizedError);
  });

  it('should generate secure refresh tokens with SHA-256 hash and future expiration', () => {
    const { rawToken, tokenHash, expiresAt } = generateRefreshToken();

    expect(typeof rawToken).toBe('string');
    expect(rawToken.length).toBe(80); // 40 bytes hex

    expect(typeof tokenHash).toBe('string');
    expect(tokenHash.length).toBe(64); // SHA-256 hex
    expect(hashToken(rawToken)).toBe(tokenHash);

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should produce consistent SHA-256 hashes for the same raw token', () => {
    const sampleToken = 'random_refresh_token_test_12345';
    const hash1 = hashToken(sampleToken);
    const hash2 = hashToken(sampleToken);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});
