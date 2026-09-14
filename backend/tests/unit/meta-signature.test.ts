import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { Request } from 'express';
import {
  verifyMetaSignature,
  verifyMetaChallengeToken,
} from '../../src/modules/webhooks/utils/meta-signature.util.js';
import { UnauthorizedError, BadRequestError } from '../../src/common/errors/app-error.js';

describe('Meta Webhook Security Utilities Unit Tests', () => {
  describe('verifyMetaSignature', () => {
    const testSecret = 'meta_test_secret_key_12345';
    const testPayload = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
    const rawBody = Buffer.from(testPayload);

    it('should verify valid HMAC SHA-256 signature when secret matches', () => {
      const validSignature = `sha256=${crypto
        .createHmac('sha256', testSecret)
        .update(rawBody)
        .digest('hex')}`;

      const req = {
        headers: { 'x-hub-signature-256': validSignature },
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req, testSecret)).toBe(true);
    });

    it('should reject tampered HMAC signature', () => {
      const tamperedSignature =
        'sha256=0000000000000000000000000000000000000000000000000000000000000000';

      const req = {
        headers: { 'x-hub-signature-256': tamperedSignature },
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req, testSecret)).toBe(false);
    });

    it('should reject when rawBody was modified after signature generation', () => {
      const validSignature = `sha256=${crypto
        .createHmac('sha256', testSecret)
        .update(rawBody)
        .digest('hex')}`;

      const tamperedBody = Buffer.from(JSON.stringify({ tampered: true }));

      const req = {
        headers: { 'x-hub-signature-256': validSignature },
        rawBody: tamperedBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req, testSecret)).toBe(false);
    });

    it('should reject when x-hub-signature-256 header is missing', () => {
      const req = {
        headers: {},
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req, testSecret)).toBe(false);
    });

    it('should reject when signature does not start with sha256=', () => {
      const req = {
        headers: { 'x-hub-signature-256': 'md5=invalidprefix123' },
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req, testSecret)).toBe(false);
    });

    it('should reject when rawBody is missing', () => {
      const req = {
        headers: { 'x-hub-signature-256': 'sha256=somevalidlookinghash' },
        rawBody: undefined,
      } as unknown as Request;

      expect(verifyMetaSignature(req, testSecret)).toBe(false);
    });

    it('should fail closed in production when secret is missing', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('META_APP_SECRET', '');

      const req = {
        headers: { 'x-local-fixture-test': 'true' },
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req)).toBe(false);
      vi.unstubAllEnvs();
    });

    it('should fail closed in live provider mode when secret is missing', () => {
      vi.stubEnv('PROVIDER_MODE', 'live');
      vi.stubEnv('META_APP_SECRET', '');

      const req = {
        headers: { 'x-local-fixture-test': 'true' },
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req)).toBe(false);
      vi.unstubAllEnvs();
    });

    it('should allow x-local-fixture-test in non-production development without secret', () => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('PROVIDER_MODE', 'mock');
      vi.stubEnv('META_APP_SECRET', '');

      const req = {
        headers: { 'x-local-fixture-test': 'true' },
        rawBody,
      } as unknown as Request;

      expect(verifyMetaSignature(req)).toBe(true);
      vi.unstubAllEnvs();
    });
  });

  describe('verifyMetaChallengeToken', () => {
    it('should return challenge when mode is subscribe and token matches', () => {
      const challenge = 'challenge_random_string_123';
      const token = 'my_test_token';

      const result = verifyMetaChallengeToken('subscribe', token, challenge, token);
      expect(result).toBe(challenge);
    });

    it('should throw BadRequestError when mode is not subscribe', () => {
      expect(() => verifyMetaChallengeToken('unsubscribe', 'token', 'challenge')).toThrow(
        BadRequestError,
      );
    });

    it('should throw UnauthorizedError when token does not match expectedToken', () => {
      expect(() =>
        verifyMetaChallengeToken('subscribe', 'wrong_token', 'challenge', 'correct_token'),
      ).toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError in production if token is not configured', () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('META_VERIFY_TOKEN', '');

      expect(() =>
        verifyMetaChallengeToken('subscribe', 'any_token', 'challenge'),
      ).toThrow(UnauthorizedError);

      vi.unstubAllEnvs();
    });

    it('should throw BadRequestError if challenge is not a string', () => {
      expect(() =>
        verifyMetaChallengeToken('subscribe', 'my_token', undefined, 'my_token'),
      ).toThrow(BadRequestError);
    });
  });
});
