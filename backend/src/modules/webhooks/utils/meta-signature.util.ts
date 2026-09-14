import crypto from 'crypto';
import { Request } from 'express';
import { env } from '../../../config/env.js';
import { UnauthorizedError, BadRequestError } from '../../../common/errors/app-error.js';

/**
 * Validates Meta x-hub-signature-256 HMAC SHA-256 against the exact raw request body.
 * Constant-time comparison prevents timing attacks.
 */
export function verifyMetaSignature(req: Request, overrideSecret?: string): boolean {
  const secret = overrideSecret || process.env['META_APP_SECRET'] || env.META_APP_SECRET;

  if (secret) {
    const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      return false;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex')}`;

    try {
      const sigBuffer = Buffer.from(signatureHeader);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (sigBuffer.length !== expectedBuffer.length) {
        return false;
      }
      return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  // Fail closed in production or when live provider mode is active if secret is not configured
  const isProduction = process.env['NODE_ENV'] === 'production' || env.NODE_ENV === 'production';
  const isLive = process.env['PROVIDER_MODE'] === 'live' || env.PROVIDER_MODE === 'live';

  if (isProduction || isLive) {
    return false;
  }

  // In local non-production development, allow designated fixture test requests
  return req.headers['x-local-fixture-test'] === 'true';
}

/**
 * Validates Meta Webhook challenge handshake parameters (GET request).
 * Returns the hub.challenge string if valid, throws UnauthorizedError or BadRequestError if invalid.
 */
export function verifyMetaChallengeToken(
  mode: unknown,
  token: unknown,
  challenge: unknown,
  expectedToken?: string,
): string {
  if (mode !== 'subscribe') {
    throw new BadRequestError('Invalid verification mode');
  }

  const configuredToken = expectedToken || process.env['META_VERIFY_TOKEN'] || env.META_VERIFY_TOKEN;
  const isProduction = process.env['NODE_ENV'] === 'production' || env.NODE_ENV === 'production';

  // Fail closed in production if token is not configured
  if (isProduction && !configuredToken) {
    throw new UnauthorizedError('Webhook verification token is not configured');
  }


  if (configuredToken && token !== configuredToken) {
    throw new UnauthorizedError('Invalid webhook verification token');
  }

  if (!configuredToken && token !== 'frankly_test_verify_token') {
    throw new UnauthorizedError('Invalid verification token');
  }

  if (typeof challenge !== 'string') {
    throw new BadRequestError('Invalid verification challenge');
  }

  return challenge;
}
