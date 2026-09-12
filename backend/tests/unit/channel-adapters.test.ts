import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { Request } from 'express';
import { env } from '../../src/config/env.js';
import { whatsAppAdapter } from '../../src/modules/webhooks/adapters/whatsapp.adapter.js';
import { instagramAdapter } from '../../src/modules/webhooks/adapters/instagram.adapter.js';
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
    it('should correctly normalize Meta Instagram messaging fixture', () => {
      const messages = instagramAdapter.normalizeInboundPayload(instagramFixture);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.channel).toBe(ChannelType.INSTAGRAM);
      expect(msg?.senderIdentifier).toBe('@maria_limassol');
      expect(msg?.senderName).toBe('@maria_limassol');
      expect(msg?.body).toContain('property investments in Paphos');
      expect(msg?.externalMessageId).toBe('m_mid.1458175510252:169d56789');
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

    it('should safely fall back to subject line when Receiving API returns non-200 status', async () => {
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
      expect(messages[0]?.body).toBe('[Subject: Urgent consultation request]');

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should safely fall back to subject line when Receiving API times out or throws a network error', async () => {
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
        .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));

      const messages = await resendEmailAdapter.normalizeInboundPayload(metadataOnlyPayload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.body).toBe('[Subject: Network failure fallback test]');

      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    });

    it('should safely fall back to subject line when Receiving API returns invalid/unparseable schema', async () => {
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
      expect(messages[0]?.body).toBe('[Subject: Malformed schema test]');

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
