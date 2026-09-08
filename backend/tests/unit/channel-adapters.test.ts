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
