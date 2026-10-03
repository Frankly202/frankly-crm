import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { Request } from 'express';
import { env } from '../../src/config/env.js';
import { whatsAppAdapter } from '../../src/modules/webhooks/adapters/whatsapp.adapter.js';
import {
  instagramAdapter,
  parseInstagramGraphError,
} from '../../src/modules/webhooks/adapters/instagram.adapter.js';
import { resendEmailAdapter } from '../../src/modules/webhooks/adapters/resend.adapter.js';
import { websiteFormAdapter } from '../../src/modules/webhooks/adapters/website.adapter.js';
import { ChannelType, LeadCategory } from '@prisma/client';

import whatsappFixture from '../../src/modules/webhooks/fixtures/whatsapp.fixture.json';
import instagramFixture from '../../src/modules/webhooks/fixtures/instagram.fixture.json';
import resendFixture from '../../src/modules/webhooks/fixtures/resend.fixture.json';
import websiteFixture from '../../src/modules/webhooks/fixtures/website.fixture.json';

describe('Channel Adapters Unit Tests', () => {
  describe('WhatsAppAdapter', () => {
    it('should correctly normalize Meta WhatsApp webhook fixture', () => {
      const messages = whatsAppAdapter.normalizeInboundPayload(whatsappFixture);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.channel).toBe(ChannelType.WHATSAPP);
      expect(msg?.senderIdentifier).toBe('+35799445566');
      expect(msg?.senderName).toBe('Costas Demetriou');
      expect(msg?.body).toContain('student accommodation in Nicosia');
      expect(msg?.externalMessageId).toContain('wamid.');
    });

    it('should verify valid Meta HMAC SHA-256 signature when secret is configured', () => {
      const testSecret = 'meta_test_secret_key_12345';
      vi.stubEnv('META_APP_SECRET', testSecret);

      const payloadString = JSON.stringify(whatsappFixture);
      const rawBody = Buffer.from(payloadString);
      const validSignature = `sha256=${crypto
        .createHmac('sha256', testSecret)
        .update(rawBody)
        .digest('hex')}`;

      const req = {
        headers: {
          'x-hub-signature-256': validSignature,
        },
        rawBody,
      } as unknown as Request;

      expect(whatsAppAdapter.verifyWebhookSignature(req)).toBe(true);

      // Tampered signature should fail
      const tamperedReq = {
        headers: {
          'x-hub-signature-256':
            'sha256=0000000000000000000000000000000000000000000000000000000000000000',
        },
        rawBody,
      } as unknown as Request;

      expect(whatsAppAdapter.verifyWebhookSignature(tamperedReq)).toBe(false);
      vi.unstubAllEnvs();
    });

    it('should fail closed in production if secret is not configured', () => {
      vi.stubEnv('META_APP_SECRET', '');
      vi.stubEnv('NODE_ENV', 'production');

      const req = {
        headers: {},
        rawBody: Buffer.from('test'),
      } as unknown as Request;

      expect(whatsAppAdapter.verifyWebhookSignature(req)).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe('InstagramAdapter', () => {
    it('should correctly normalize Meta Instagram messaging fixture with numeric IGSID and username handle', () => {
      const messages = instagramAdapter.normalizeInboundPayload(instagramFixture);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.channel).toBe(ChannelType.INSTAGRAM);
      // Sender identifier must strictly be numeric IGSID
      expect(msg?.senderIdentifier).toBe('17841400099887766');
      expect(msg?.senderName).toBe('@maria_limassol');
      expect(msg?.recipientIdentifier).toBe('17841400000000001');
      expect(msg?.body).toContain('property investments in Paphos');
      expect(msg?.externalMessageId).toBe('m_mid.1458175510252:169d56789');
    });

    it('should normalize Instagram payload gracefully when username is omitted', () => {
      const payloadWithoutUsername = {
        object: 'instagram',
        entry: [
          {
            id: '17841400000000001',
            time: 1725717600000,
            messaging: [
              {
                sender: { id: '17841400011223344' },
                recipient: { id: '17841400000000001' },
                timestamp: 1725717600000,
                message: {
                  mid: 'm_mid_anon_123',
                  text: 'Hi Frankly',
                },
              },
            ],
          },
        ],
      };

      const messages = instagramAdapter.normalizeInboundPayload(payloadWithoutUsername);
      expect(messages.length).toBe(1);
      const msg = messages[0];
      expect(msg?.senderIdentifier).toBe('17841400011223344');
      expect(msg?.senderName).toBe('Instagram User (3344)');
      expect(msg?.body).toBe('Hi Frankly');
    });

    it('should filter out foreign Instagram accounts when INSTAGRAM_BUSINESS_ACCOUNT_ID is configured', () => {
      vi.stubEnv('INSTAGRAM_BUSINESS_ACCOUNT_ID', '17841400000000001');

      const foreignPayload = {
        object: 'instagram',
        entry: [
          {
            id: 'foreign_account_99999',
            time: 1725717600000,
            messaging: [
              {
                sender: { id: '17841400099887766' },
                message: { mid: 'mid_foreign_1', text: 'Spam' },
              },
            ],
          },
          {
            id: '17841400000000001',
            time: 1725717600000,
            messaging: [
              {
                sender: { id: '17841400099887766' },
                message: { mid: 'mid_valid_1', text: 'Valid message' },
              },
            ],
          },
        ],
      };

      const messages = instagramAdapter.normalizeInboundPayload(foreignPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.externalMessageId).toBe('mid_valid_1');
      vi.unstubAllEnvs();
    });

    it('should reject outbound sends with non-numeric recipient identifier', async () => {
      await expect(
        instagramAdapter.sendOutboundMessage({
          conversationId: 'conv-1',
          recipientIdentifier: '@maria_limassol',
          body: 'Hello',
        }),
      ).rejects.toThrow('must be a numerical Instagram Scoped ID (IGSID)');

      await expect(
        instagramAdapter.sendOutboundMessage({
          conversationId: 'conv-1',
          recipientIdentifier: '',
          body: 'Hello',
        }),
      ).rejects.toThrow('must be a numerical Instagram Scoped ID (IGSID)');
    });

    it('should send simulated outbound message in mock mode preserving recipient and window tag flag', async () => {
      vi.stubEnv('PROVIDER_MODE', 'mock');

      const resultStandard = await instagramAdapter.sendOutboundMessage({
        conversationId: 'conv-1',
        recipientIdentifier: '17841400099887766',
        body: 'Standard reply',
        metadata: { isHumanAgentWindow: false },
      });

      expect(resultStandard.success).toBe(true);
      expect(resultStandard.details?.['recipient']).toBe('17841400099887766');
      expect(resultStandard.details?.['isHumanAgentWindow']).toBe(false);

      const resultHumanAgent = await instagramAdapter.sendOutboundMessage({
        conversationId: 'conv-1',
        recipientIdentifier: '17841400099887766',
        body: 'Extended window reply',
        metadata: { isHumanAgentWindow: true },
      });

      expect(resultHumanAgent.success).toBe(true);
      expect(resultHumanAgent.details?.['isHumanAgentWindow']).toBe(true);

      vi.unstubAllEnvs();
    });

    it('should format live request with HUMAN_AGENT message tag when isHumanAgentWindow is true', async () => {
      vi.stubEnv('PROVIDER_MODE', 'live');
      vi.stubEnv('INSTAGRAM_ACCESS_TOKEN', 'test_ig_page_access_token');

      let capturedBody: Record<string, unknown> | null = null;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            message_id: 'ig_mid_12345',
            recipient_id: '17841400099887766',
          }),
        };
      });

      const res = await instagramAdapter.sendOutboundMessage({
        conversationId: 'conv-1',
        recipientIdentifier: '17841400099887766',
        body: 'Support follow up after 24h',
        metadata: { isHumanAgentWindow: true },
      });

      expect(res.success).toBe(true);
      expect(res.externalMessageId).toBe('ig_mid_12345');
      expect(capturedBody).toEqual({
        recipient: { id: '17841400099887766' },
        message: { text: 'Support follow up after 24h' },
        messaging_type: 'MESSAGE_TAG',
        tag: 'HUMAN_AGENT',
      });

      globalThis.fetch = originalFetch;
      vi.unstubAllEnvs();
    });

    it('should map Instagram Graph API errors accurately in parseInstagramGraphError', () => {
      // Window expired / unsupported message tag
      const errWindow = parseInstagramGraphError(400, {
        error: { message: 'Message outside window', code: 10, error_subcode: 2534037 },
      });
      expect(errWindow.statusCode).toBe(422);
      expect(errWindow.code).toBe('INSTAGRAM_WINDOW_EXPIRED');

      // Token invalid / expired
      const errToken = parseInstagramGraphError(401, {
        error: { message: 'Session invalid', code: 190 },
      });
      expect(errToken.statusCode).toBe(502);

      // Rate limit hit
      const errRate = parseInstagramGraphError(429, {
        error: { message: 'Too many calls', code: 429 },
      });
      expect(errRate.statusCode).toBe(429);
      expect(errRate.code).toBe('INSTAGRAM_RATE_LIMIT_EXCEEDED');

      // Missing asset permissions (subcode 33)
      const errPerm = parseInstagramGraphError(400, {
        error: { message: 'Asset not assigned', code: 100, error_subcode: 33 },
      });
      expect(errPerm.statusCode).toBe(502);

      // General invalid parameter
      const errBadParam = parseInstagramGraphError(400, {
        error: { message: 'Invalid recipient', code: 100 },
      });
      expect(errBadParam.statusCode).toBe(400);
    });

    it('should fail closed when signature is invalid or missing', () => {
      const testSecret = 'ig_secret_54321';
      vi.stubEnv('META_APP_SECRET', testSecret);

      const req = {
        headers: {},
        rawBody: Buffer.from('{}'),
      } as unknown as Request;

      expect(instagramAdapter.verifyWebhookSignature(req)).toBe(false);
      vi.unstubAllEnvs();
    });
  });

  describe('ResendEmailAdapter', () => {
    it('should correctly normalize Resend inbound email fixture with embedded text', async () => {
      const messages = await resendEmailAdapter.normalizeInboundPayload(resendFixture);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.channel).toBe(ChannelType.RESEND_EMAIL);
      expect(msg?.senderIdentifier).toBe('katerina.v@example.com');
      expect(msg?.senderName).toBe('Katerina Vanezi');
      expect(msg?.recipientIdentifier).toBe('emmanuel@frankedu-global.com');
      expect(msg?.body).toContain('medical degree programs in Cyprus');
      expect(msg?.externalMessageId).toBe('email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9');
    });

    it('should fetch full plain text body from Resend Receiving API when webhook payload is metadata-only', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        created_at: '2026-09-08T14:00:00.000Z',
        data: {
          email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
          from: 'Andreas Papantoniou <andreas@example.com>',
          to: ['emmanuel@inbound.frankedu-global.com'],
          subject: 'Limassol property inquiry',
        },
      };

      const originalKey = env.RESEND_API_KEY;
      env.RESEND_API_KEY = 're_test_dummy_key_123';
      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: '56761188-7520-42d8-8898-ff6fc54ce618',
          text: 'Hello, I would like more information on 2-bed apartments in Germasogeia.',
          html: '<p>Hello, I would like more information on 2-bed apartments in Germasogeia.</p>',
          subject: 'Limassol property inquiry',
        }),
      } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.senderIdentifier).toBe('andreas@example.com');
      expect(msg?.senderName).toBe('Andreas Papantoniou');
      expect(msg?.body).toBe(
        'Hello, I would like more information on 2-bed apartments in Germasogeia.',
      );
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.resend.com/emails/receiving/56761188-7520-42d8-8898-ff6fc54ce618',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer re_test_dummy_key_123',
          }),
        }),
      );

      fetchSpy.mockRestore();
      env.RESEND_API_KEY = originalKey;
      vi.unstubAllEnvs();
    });

    it('should strip HTML and use it when Receiving API returns html with empty text', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_html_only_123',
          from: 'Elena <elena@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'HTML Only inquiry',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'email_html_only_123',
          text: null,
          html: '<div><h1>Partnership Proposal</h1><p>Please review our <b>MOU</b> terms.</p></div>',
          subject: 'HTML Only inquiry',
        }),
      } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('Partnership Proposal Please review our MOU terms.');

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should safely fall back to subject line with pending indicator and FAILED metadata when Receiving API returns non-retryable 4xx status', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_404_id',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Urgent consultation request',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Urgent consultation request] (Email content retrieval pending)');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBe('FAILED');
      expect(messages[0]?.rawPayload?.['statusCode']).toBe(404);
      expect(fetchSpy).toHaveBeenCalledTimes(1); // Non-retryable 404 must NOT retry

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should safely fall back with pending indicator and FAILED metadata when Receiving API times out on both attempts', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_timeout_id',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Network failure fallback test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('The operation was aborted due to timeout'));

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Network failure fallback test] (Email content retrieval pending)');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBe('FAILED');
      expect(fetchSpy).toHaveBeenCalledTimes(2); // Retries on timeout

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should safely fall back with pending indicator when Receiving API returns invalid/unparseable schema', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_invalid_schema_id',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Malformed schema test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          text: 12345, // Invalid: should be string
          html: ['not a string'], // Invalid
        }),
      } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Malformed schema test] (Email content retrieval pending)');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBe('FAILED');
      expect(messages[0]?.rawPayload?.['statusCode']).toBe(200);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should successfully fetch full email content on retry when attempt 1 returns 500 and attempt 2 returns 200 (Phase 6)', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_retry_500_success',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Retry 500 test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'email_retry_500_success',
            text: 'Recovered body after 500 error',
            subject: 'Retry 500 test',
            headers: {
              'message-id': '<msg-500-retry@example.com>',
            },
          }),
        } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('Recovered body after 500 error');
      expect(messages[0]?.rfcMessageId).toBe('<msg-500-retry@example.com>');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should successfully fetch full email content on retry when attempt 1 returns 429 and attempt 2 returns 200 (Phase 6)', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_retry_429_success',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Retry 429 test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'email_retry_429_success',
            text: 'Recovered body after rate limit',
            subject: 'Retry 429 test',
          }),
        } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('Recovered body after rate limit');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should successfully fetch full email content on retry when attempt 1 times out and attempt 2 returns 200 (Phase 6)', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_retry_timeout_success',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Retry timeout test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            id: 'email_retry_timeout_success',
            text: 'Recovered body after initial timeout',
            subject: 'Retry timeout test',
          }),
        } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('Recovered body after initial timeout');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBeUndefined();
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should fail fast with exactly one fetch call when Receiving API returns 422 Unprocessable (Phase 6)', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_422_id',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Unprocessable entity test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 422,
      } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Unprocessable entity test] (Email content retrieval pending)');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBe('FAILED');
      expect(messages[0]?.rawPayload?.['statusCode']).toBe(422);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should gracefully fall back and tag FAILED metadata with statusCode 500 when persistent 500 exhausts retries (Phase 6)', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_persistent_500_id',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Persistent 500 failure test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Persistent 500 failure test] (Email content retrieval pending)');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBe('FAILED');
      expect(messages[0]?.rawPayload?.['statusCode']).toBe(500);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should gracefully fall back and tag statusCode 429 when persistent rate limit exhausts retries (Phase 6)', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        data: {
          email_id: 'email_persistent_429_id',
          from: 'Client <client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Persistent 429 failure test',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
        } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Persistent 429 failure test] (Email content retrieval pending)');
      expect(messages[0]?.rawPayload?.['contentFetchStatus']).toBe('FAILED');
      expect(messages[0]?.rawPayload?.['statusCode']).toBe(429);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should extract RFC headers (Message-ID, In-Reply-To, References) case-insensitively and sanitize CR/LF', async () => {
      const payload = {
        type: 'email.received',
        data: {
          email_id: 'email_rfc_headers_id',
          from: 'Sender <sender@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Threaded inquiry\r\nBcc: evil@attacker.com',
        },
      };

      vi.stubEnv('RESEND_API_KEY', 're_test_dummy_key_123');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'email_rfc_headers_id',
          text: 'Inquiry body',
          subject: 'Threaded inquiry\r\nBcc: evil@attacker.com',
          headers: {
            'Message-Id': '<message-123@example.com>\r\n',
            'in-reply-to': ['<parent-456@example.com>'],
            REFERENCES: '<root-001@example.com> <parent-456@example.com>',
          },
        }),
      } as unknown as Response);

      const messages = await resendEmailAdapter.normalizeInboundPayload(payload);
      expect(messages.length).toBe(1);
      const msg = messages[0];
      expect(msg?.subject).toBe('Threaded inquiry Bcc: evil@attacker.com');
      expect(msg?.rfcMessageId).toBe('<message-123@example.com>');
      expect(msg?.inReplyTo).toBe('<parent-456@example.com>');
      expect(msg?.references).toBe('<root-001@example.com> <parent-456@example.com>');

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should pass Idempotency-Key and threading headers when dispatching outbound email in live mode', async () => {
      const origProviderMode = env.PROVIDER_MODE;
      const origApiKey = env.RESEND_API_KEY;
      const origFrom = env.EMAIL_FROM_ADDRESS;
      const origReplyTo = env.EMAIL_REPLY_TO;

      env.PROVIDER_MODE = 'live' as unknown as typeof env.PROVIDER_MODE;
      env.RESEND_API_KEY = 're_test_key_live_123';
      env.EMAIL_FROM_ADDRESS = 'Frankly CRM <emmanuel@frankedu-global.com>';
      env.EMAIL_REPLY_TO = 'frankly@huejoraata.resend.app';

      vi.stubEnv('PROVIDER_MODE', 'live');
      vi.stubEnv('RESEND_API_KEY', 're_test_key_live_123');
      vi.stubEnv('EMAIL_FROM_ADDRESS', 'Frankly CRM <emmanuel@frankedu-global.com>');
      vi.stubEnv('EMAIL_REPLY_TO', 'frankly@huejoraata.resend.app');

      let interceptedHeaders: Record<string, string> = {};
      let interceptedBody: Record<string, unknown> = {};

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async (url, init) => {
        interceptedHeaders = (init?.headers || {}) as Record<string, string>;
        interceptedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 'resend_live_msg_987' }),
        } as unknown as Response;
      });

      const result = await resendEmailAdapter.sendOutboundMessage({
        conversationId: 'conv-123',
        recipientIdentifier: 'customer@example.com',
        body: 'Thank you for contacting Frankly.',
        subject: 'Re: Inquiry\r\nX-Injected: Bad',
        inReplyTo: '<parent-msg@example.com>\r\n',
        references: '<root-msg@example.com> <parent-msg@example.com>',
        idempotencyKey: 'idem_custom_key_456',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBe('resend_live_msg_987');
      expect(interceptedHeaders['Idempotency-Key']).toBe('idem_custom_key_456');
      expect(interceptedHeaders['Authorization']).toBe('Bearer re_test_key_live_123');
      expect(interceptedBody['subject']).toBe('Re: Inquiry X-Injected: Bad');
      expect(interceptedBody['headers']).toEqual({
        'In-Reply-To': '<parent-msg@example.com>',
        'References': '<root-msg@example.com> <parent-msg@example.com>',
      });

      fetchSpy.mockRestore();
      env.PROVIDER_MODE = origProviderMode;
      env.RESEND_API_KEY = origApiKey;
      env.EMAIL_FROM_ADDRESS = origFrom;
      env.EMAIL_REPLY_TO = origReplyTo;
      vi.unstubAllEnvs();
    });

    it('should truncate oversized email body exceeding 250KB limit and append notice (Phase 3)', async () => {
      const hugeText = 'A'.repeat(300_000);
      const hugeEmailPayload = {
        type: 'email.received',
        created_at: new Date().toISOString(),
        data: {
          email_id: 'huge_email_123',
          from: 'Huge Sender <huge@example.com>',
          to: ['inbox@frankedu-global.com'],
          subject: 'Huge Email Payload',
          text: hugeText,
        },
      };

      const normalized = await resendEmailAdapter.normalizeInboundPayload(hugeEmailPayload);
      expect(normalized.length).toBe(1);

      const msg = normalized[0]!;
      expect(msg.body.length).toBe(250_000 + '\n\n[Message body truncated: content exceeded 250KB display limit]'.length);
      expect(msg.body.endsWith('[Message body truncated: content exceeded 250KB display limit]')).toBe(true);
      expect(msg.body.startsWith('AAAAA')).toBe(true);
      expect(msg.senderName).toBe('Huge Sender');
    });

    it('should minimize rawPayload by removing redundant HTML content while preserving envelope (Phase 3)', async () => {
      const payloadWithHtml = {
        type: 'email.received',
        created_at: new Date().toISOString(),
        data: {
          email_id: 'html_email_456',
          from: 'Alice Smith <alice@example.com>',
          to: ['inbox@frankedu-global.com'],
          subject: 'HTML Newsletter',
          text: 'Plain text preview',
          html: '<div>' + '<p>Heavy HTML content</p>'.repeat(1000) + '</div>',
          rawHtml: '<html>...</html>',
        },
      };

      const normalized = await resendEmailAdapter.normalizeInboundPayload(payloadWithHtml);
      expect(normalized.length).toBe(1);

      const msg = normalized[0]!;
      expect(msg.senderName).toBe('Alice Smith');
      expect(msg.body).toBe('Plain text preview');

      const rawData = (msg.rawPayload as { data?: Record<string, unknown> }).data;
      expect(rawData).toBeDefined();
      expect(rawData?.['html']).toBeUndefined();
      expect(rawData?.['rawHtml']).toBeUndefined();
      expect(rawData?.['email_id']).toBe('html_email_456');
      expect(rawData?.['from']).toBe('Alice Smith <alice@example.com>');
      expect(rawData?.['subject']).toBe('HTML Newsletter');
    });
  });

  describe('WebsiteFormAdapter', () => {
    it('should correctly normalize Website form enquiry fixture and map category', () => {
      const messages = websiteFormAdapter.normalizeInboundPayload(websiteFixture);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.channel).toBe(ChannelType.WEBSITE_FORM);
      expect(msg?.senderIdentifier).toBe('alex.christou@example.com');
      expect(msg?.senderName).toBe('Alexandros Christou');
      expect(msg?.suggestedCategory).toBe(LeadCategory.PROPERTY_BUYER_INVESTOR);
      expect(msg?.body).toContain('residential property near Larnaca airport');
    });

    it('should drop bot submissions when honeypot field is filled', () => {
      const botPayload = {
        ...websiteFixture,
        _hp_company: 'Spam Corp Ltd',
      };

      const messages = websiteFormAdapter.normalizeInboundPayload(botPayload);
      expect(messages.length).toBe(0);

      const req = {
        body: botPayload,
      } as unknown as Request;
      expect(websiteFormAdapter.verifyWebhookSignature(req)).toBe(false);
    });
  });
});
