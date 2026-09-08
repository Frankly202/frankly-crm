import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { Request } from 'express';
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
          'x-hub-signature-256': 'sha256=0000000000000000000000000000000000000000000000000000000000000000',
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
    it('should correctly normalize Resend inbound email fixture', () => {
      const messages = resendEmailAdapter.normalizeInboundPayload(resendFixture);
      expect(messages.length).toBe(1);

      const msg = messages[0];
      expect(msg?.channel).toBe(ChannelType.RESEND_EMAIL);
      expect(msg?.senderIdentifier).toBe('katerina.v@example.com');
      expect(msg?.senderName).toBe('Katerina Vanezi');
      expect(msg?.recipientIdentifier).toBe('emmanuel@frankedu-global.com');
      expect(msg?.body).toContain('medical degree programs in Cyprus');
      expect(msg?.externalMessageId).toBe('email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9');
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
