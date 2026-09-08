import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { whatsAppAdapter } from '../../src/modules/webhooks/adapters/whatsapp.adapter.js';
import { instagramAdapter } from '../../src/modules/webhooks/adapters/instagram.adapter.js';
import { resendEmailAdapter } from '../../src/modules/webhooks/adapters/resend.adapter.js';
import { env } from '../../src/config/env.js';
import { BadGatewayError } from '../../src/common/errors/app-error.js';
import { Request } from 'express';
import crypto from 'crypto';

describe('External Provider Adapters (Phase 9)', () => {
  const originalEnv = { ...env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    env.PROVIDER_MODE = 'mock';
    env.WHATSAPP_PHONE_NUMBER_ID = undefined;
    env.WHATSAPP_ACCESS_TOKEN = undefined;
    env.INSTAGRAM_PAGE_ID = undefined;
    env.INSTAGRAM_ACCESS_TOKEN = undefined;
    env.RESEND_API_KEY = undefined;
    env.EMAIL_FROM_ADDRESS = undefined;
    env.EMAIL_REPLY_TO = undefined;
    env.META_GRAPH_API_VERSION = 'v26.0';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.assign(env, originalEnv);
  });

  describe('WhatsApp Adapter Outbound', () => {
    it('should simulate outbound delivery when PROVIDER_MODE is mock', async () => {
      env.PROVIDER_MODE = 'mock';

      const result = await whatsAppAdapter.sendOutboundMessage({
        conversationId: 'conv-1',
        recipientIdentifier: '+35799123456',
        body: 'Hello from mock mode',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toMatch(/^wa_out_/);
      expect(result.details?.simulated).toBe(true);
    });

    it('should fail closed in live mode when credentials are missing', async () => {
      env.PROVIDER_MODE = 'live';
      env.WHATSAPP_PHONE_NUMBER_ID = undefined;
      env.WHATSAPP_ACCESS_TOKEN = undefined;

      await expect(
        whatsAppAdapter.sendOutboundMessage({
          conversationId: 'conv-1',
          recipientIdentifier: '+35799123456',
          body: 'Hello from live mode',
        }),
      ).rejects.toThrow(BadGatewayError);
    });

    it('should call Meta Graph API and return real message ID when live credentials are valid', async () => {
      env.PROVIDER_MODE = 'live';
      env.WHATSAPP_PHONE_NUMBER_ID = 'phone-12345';
      env.WHATSAPP_ACCESS_TOKEN = 'test-token-meta';
      env.META_GRAPH_API_VERSION = 'v26.0';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ id: 'wamid.HBgLMzU3OTkxMjM0NTYVAgAS' }],
        }),
      });
      global.fetch = mockFetch;

      const result = await whatsAppAdapter.sendOutboundMessage({
        conversationId: 'conv-1',
        recipientIdentifier: '+35799123456',
        body: 'Real WhatsApp message',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBe('wamid.HBgLMzU3OTkxMjM0NTYVAgAS');
      expect(result.details?.simulated).toBe(false);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://graph.facebook.com/v26.0/phone-12345/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-meta',
          }),
        }),
      );
    });

    it('should throw BadGatewayError when Meta API returns an error response', async () => {
      env.PROVIDER_MODE = 'live';
      env.WHATSAPP_PHONE_NUMBER_ID = 'phone-12345';
      env.WHATSAPP_ACCESS_TOKEN = 'test-token-meta';

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: 'Invalid parameter',
            code: 100,
          },
        }),
      });

      await expect(
        whatsAppAdapter.sendOutboundMessage({
          conversationId: 'conv-1',
          recipientIdentifier: '+35799123456',
          body: 'Real WhatsApp message',
        }),
      ).rejects.toThrow(/WhatsApp delivery failed: Invalid parameter/);
    });
  });

  describe('Instagram Adapter Outbound', () => {
    it('should simulate outbound delivery when PROVIDER_MODE is mock', async () => {
      env.PROVIDER_MODE = 'mock';

      const result = await instagramAdapter.sendOutboundMessage({
        conversationId: 'conv-2',
        recipientIdentifier: 'ig_user_123',
        body: 'Hello from mock IG',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toMatch(/^ig_out_/);
      expect(result.details?.simulated).toBe(true);
    });

    it('should fail closed in live mode when access token is missing', async () => {
      env.PROVIDER_MODE = 'live';
      env.INSTAGRAM_ACCESS_TOKEN = undefined;

      await expect(
        instagramAdapter.sendOutboundMessage({
          conversationId: 'conv-2',
          recipientIdentifier: 'ig_user_123',
          body: 'Hello from live IG',
        }),
      ).rejects.toThrow(BadGatewayError);
    });

    it('should dispatch to Graph API in live mode when configured', async () => {
      env.PROVIDER_MODE = 'live';
      env.INSTAGRAM_ACCESS_TOKEN = 'ig-test-token';
      env.META_GRAPH_API_VERSION = 'v26.0';

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          recipient_id: 'ig_user_123',
          message_id: 'm_mid.1458175510252:169d56789',
        }),
      });

      const result = await instagramAdapter.sendOutboundMessage({
        conversationId: 'conv-2',
        recipientIdentifier: 'ig_user_123',
        body: 'Real IG DM',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBe('m_mid.1458175510252:169d56789');
      expect(result.details?.simulated).toBe(false);
    });
  });

  describe('Resend Adapter Outbound & Webhook Security', () => {
    it('should simulate outbound delivery when PROVIDER_MODE is mock', async () => {
      env.PROVIDER_MODE = 'mock';

      const result = await resendEmailAdapter.sendOutboundMessage({
        conversationId: 'conv-3',
        recipientIdentifier: 'student@example.com',
        body: 'Your enrollment brochure',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toMatch(/^resend_out_/);
      expect(result.details?.simulated).toBe(true);
    });

    it('should fail closed in live mode when API key or sender is missing', async () => {
      env.PROVIDER_MODE = 'live';
      env.RESEND_API_KEY = undefined;
      env.EMAIL_FROM_ADDRESS = undefined;

      await expect(
        resendEmailAdapter.sendOutboundMessage({
          conversationId: 'conv-3',
          recipientIdentifier: 'student@example.com',
          body: 'Real email',
        }),
      ).rejects.toThrow(BadGatewayError);
    });

    it('should call Resend API with configured sender and reply_to in live mode', async () => {
      env.PROVIDER_MODE = 'live';
      env.RESEND_API_KEY = 're_test_998877';
      env.EMAIL_FROM_ADDRESS = 'FranklyEdu Global <admissions@crm.frankedu-global.com>';
      env.EMAIL_REPLY_TO = 'emmanuel@frankedu-global.com';

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9',
        }),
      });
      global.fetch = mockFetch;

      const result = await resendEmailAdapter.sendOutboundMessage({
        conversationId: 'conv-3',
        recipientIdentifier: 'student@example.com',
        body: 'Real email body text',
        metadata: { subject: 'Admissions Enquiry Response' },
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBe('email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9');
      expect(result.details?.simulated).toBe(false);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_998877',
          }),
          body: JSON.stringify({
            from: 'FranklyEdu Global <admissions@crm.frankedu-global.com>',
            to: ['student@example.com'],
            reply_to: 'emmanuel@frankedu-global.com',
            subject: 'Admissions Enquiry Response',
            text: 'Real email body text',
          }),
        }),
      );
    });

    describe('Resend Webhook Replay Protection', () => {
      const secret = 'whsec_dGVzdF9zZWNyZXRfa2V5XzEyMzQ1Njc4OTAxMjM0NTY=';
      const cleanSecret = 'dGVzdF9zZWNyZXRfa2V5XzEyMzQ1Njc4OTAxMjM0NTY=';
      const keyBuffer = Buffer.from(cleanSecret, 'base64');
      const rawBody = Buffer.from(JSON.stringify({ type: 'email.received' }));

      it('should accept Svix webhook within 5 minutes tolerance', () => {
        env.RESEND_WEBHOOK_SECRET = secret;
        const nowSec = Math.floor(Date.now() / 1000);
        const svixId = 'msg_test_123';
        const svixTimestamp = String(nowSec);

        const toSign = `${svixId}.${svixTimestamp}.${rawBody.toString('utf-8')}`;
        const signature = crypto.createHmac('sha256', keyBuffer).update(toSign).digest('base64');

        const req = {
          headers: {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': `v1,${signature}`,
          },
          rawBody,
        } as unknown as Request;

        expect(resendEmailAdapter.verifyWebhookSignature(req)).toBe(true);
      });

      it('should reject Svix webhook if timestamp is older than 5 minutes (replay attack)', () => {
        env.RESEND_WEBHOOK_SECRET = secret;
        const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6.6 minutes ago
        const svixId = 'msg_test_old';
        const svixTimestamp = String(oldTimestamp);

        const toSign = `${svixId}.${svixTimestamp}.${rawBody.toString('utf-8')}`;
        const signature = crypto.createHmac('sha256', keyBuffer).update(toSign).digest('base64');

        const req = {
          headers: {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': `v1,${signature}`,
          },
          rawBody,
        } as unknown as Request;

        expect(resendEmailAdapter.verifyWebhookSignature(req)).toBe(false);
      });
    });

    describe('Fail-Closed Live Mode Webhook Verification', () => {
      it('should fail closed in live mode if META_APP_SECRET is not configured', () => {
        env.PROVIDER_MODE = 'live';
        env.META_APP_SECRET = undefined;

        const req = {
          headers: {
            'x-local-fixture-test': 'true',
          },
          rawBody: Buffer.from('{}'),
        } as unknown as Request;

        expect(whatsAppAdapter.verifyWebhookSignature(req)).toBe(false);
        expect(instagramAdapter.verifyWebhookSignature(req)).toBe(false);
      });

      it('should fail closed in live mode if RESEND_WEBHOOK_SECRET is not configured', () => {
        env.PROVIDER_MODE = 'live';
        env.RESEND_WEBHOOK_SECRET = undefined;

        const req = {
          headers: {
            'x-local-fixture-test': 'true',
          },
          rawBody: Buffer.from('{}'),
        } as unknown as Request;

        expect(resendEmailAdapter.verifyWebhookSignature(req)).toBe(false);
      });

      it('should verify Meta signature using timing-safe comparison on rawBody and reject length mismatch', () => {
        env.META_APP_SECRET = 'super_secret_meta_app_key';
        const rawBody = Buffer.from(JSON.stringify({ entry: [] }));
        const validSig = `sha256=${crypto.createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')}`;

        const validReq = {
          headers: { 'x-hub-signature-256': validSig },
          rawBody,
        } as unknown as Request;
        expect(whatsAppAdapter.verifyWebhookSignature(validReq)).toBe(true);

        const shortSigReq = {
          headers: { 'x-hub-signature-256': 'sha256=1234short' },
          rawBody,
        } as unknown as Request;
        expect(whatsAppAdapter.verifyWebhookSignature(shortSigReq)).toBe(false);
      });
    });

    describe('Instagram Recipient Identifier Sanitization', () => {
      it('should strip leading @ from Instagram handle when dispatching in live mode', async () => {
        env.PROVIDER_MODE = 'live';
        env.INSTAGRAM_ACCESS_TOKEN = 'ig-test-token';
        env.META_GRAPH_API_VERSION = 'v26.0';

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            recipient_id: 'maria_limassol',
            message_id: 'm_mid.1458175510252:169d56789',
          }),
        });
        global.fetch = mockFetch;

        const result = await instagramAdapter.sendOutboundMessage({
          conversationId: 'conv-2',
          recipientIdentifier: '@maria_limassol',
          body: 'Hello Maria',
        });

        expect(result.success).toBe(true);
        expect(mockFetch).toHaveBeenCalledWith(
          'https://graph.facebook.com/v26.0/me/messages',
          expect.objectContaining({
            body: JSON.stringify({
              recipient: { id: 'maria_limassol' },
              message: { text: 'Hello Maria' },
            }),
          }),
        );
      });
    });
  });
});
