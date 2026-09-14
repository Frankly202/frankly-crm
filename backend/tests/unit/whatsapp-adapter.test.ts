import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  whatsAppAdapter,
  parseMetaGraphError,
} from '../../src/modules/webhooks/adapters/whatsapp.adapter.js';

describe('WhatsApp Adapter & Meta Graph Error Mapping Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('parseMetaGraphError', () => {
    it('should map code 131047 to WHATSAPP_WINDOW_EXPIRED (422)', () => {
      const err = parseMetaGraphError(400, {
        error: {
          code: 131047,
          message: 'Re-engagement message',
          error_data: {
            details: 'More than 24 hours have passed since the customer last replied.',
          },
        },
      });

      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('WHATSAPP_WINDOW_EXPIRED');
      expect(err.message).toContain('Customer service window expired (>24h)');
    });

    it('should map error_subcode 2494010 to WHATSAPP_WINDOW_EXPIRED (422)', () => {
      const err = parseMetaGraphError(400, {
        error: {
          code: 131047,
          error_subcode: 2494010,
          message: 'Template required outside 24h window',
        },
      });

      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('WHATSAPP_WINDOW_EXPIRED');
    });

    it('should map code 131026 to WHATSAPP_RECIPIENT_NOT_ON_WHATSAPP (422)', () => {
      const err = parseMetaGraphError(400, {
        error: {
          code: 131026,
          message: 'Message undeliverable',
          error_data: {
            details: 'Recipient is not a valid WhatsApp user.',
          },
        },
      });

      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('WHATSAPP_RECIPIENT_NOT_ON_WHATSAPP');
    });

    it('should map rate limit codes 130429 and 80007 to WHATSAPP_RATE_LIMIT_EXCEEDED (429)', () => {
      const err1 = parseMetaGraphError(400, {
        error: {
          code: 130429,
          message: 'Cloud API rate limit hit',
        },
      });
      expect(err1.statusCode).toBe(429);
      expect(err1.code).toBe('WHATSAPP_RATE_LIMIT_EXCEEDED');

      const err2 = parseMetaGraphError(429, {
        error: {
          code: 80007,
          message: 'Throughput limit exceeded',
        },
      });
      expect(err2.statusCode).toBe(429);
      expect(err2.code).toBe('WHATSAPP_RATE_LIMIT_EXCEEDED');
    });

    it('should map code 190 to META_AUTHENTICATION_FAILED (502 Bad Gateway)', () => {
      const err = parseMetaGraphError(401, {
        error: {
          code: 190,
          message: 'Invalid OAuth access token',
        },
      });

      expect(err.statusCode).toBe(502);
      expect(err.message).toContain('Meta system user access token is invalid or expired');
    });

    it('should map code 131042 to payment issue (502 Bad Gateway)', () => {
      const err = parseMetaGraphError(400, {
        error: {
          code: 131042,
          message: 'Business payment issue',
        },
      });

      expect(err.statusCode).toBe(502);
      expect(err.message).toContain('payment method or credit line issue');
    });

    it('should map code 100 to BAD_REQUEST (400)', () => {
      const err = parseMetaGraphError(400, {
        error: {
          code: 100,
          message: 'Invalid parameter',
        },
      });

      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('BAD_REQUEST');
    });

    it('should default unrecognized errors to BAD_GATEWAY (502)', () => {
      const err = parseMetaGraphError(500, {
        error: {
          code: 999999,
          message: 'Internal server error from Meta',
        },
      });

      expect(err.statusCode).toBe(502);
      expect(err.message).toContain('Internal server error from Meta');
    });
  });

  describe('normalizeInboundPayload Media Captions', () => {
    it('should extract text body for text messages', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.TXT_001',
                      type: 'text',
                      text: { body: 'Hello Frankly!' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(result.length).toBe(1);
      expect(result[0]?.body).toBe('Hello Frankly!');
    });

    it('should extract caption for image messages when present', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.IMG_001',
                      type: 'image',
                      image: {
                        caption: 'Passport copy for student visa',
                        mime_type: 'image/jpeg',
                        id: 'media_img_123',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(result.length).toBe(1);
      expect(result[0]?.body).toBe('[Image] Passport copy for student visa');
    });

    it('should format image messages without caption as [Image]', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.IMG_002',
                      type: 'image',
                      image: {
                        mime_type: 'image/jpeg',
                        id: 'media_img_456',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(result.length).toBe(1);
      expect(result[0]?.body).toBe('[Image]');
    });

    it('should format document messages with filename and caption', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.DOC_001',
                      type: 'document',
                      document: {
                        filename: 'academic_transcripts.pdf',
                        caption: 'Attached are my BSc transcripts',
                        mime_type: 'application/pdf',
                        id: 'media_doc_123',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(result.length).toBe(1);
      expect(result[0]?.body).toBe('[Document: academic_transcripts.pdf] Attached are my BSc transcripts');
    });

    it('should format video, audio, and location messages properly', () => {
      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.VID_001',
                      type: 'video',
                      video: { caption: 'Campus tour video' },
                    },
                    {
                      from: '35799123456',
                      id: 'wamid.AUD_001',
                      type: 'audio',
                      audio: { id: 'aud_1' },
                    },
                    {
                      from: '35799123456',
                      id: 'wamid.LOC_001',
                      type: 'location',
                      location: {
                        name: 'FranklyEdu Office',
                        address: '15 Nicosia Avenue',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(result.length).toBe(3);
      expect(result[0]?.body).toBe('[Video] Campus tour video');
      expect(result[1]?.body).toBe('[Audio message]');
      expect(result[2]?.body).toBe('[Location: FranklyEdu Office - 15 Nicosia Avenue]');
    });
  });

  describe('Tenant and Phone Number ID Filtering', () => {
    it('should filter out entries that do not match configured WHATSAPP_BUSINESS_ACCOUNT_ID', () => {
      vi.stubEnv('WHATSAPP_BUSINESS_ACCOUNT_ID', 'MY_OFFICIAL_WABA_ID');

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'FOREIGN_WABA_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.FOREIGN_001',
                      type: 'text',
                      text: { body: 'Should be ignored' },
                    },
                  ],
                },
              },
            ],
          },
          {
            id: 'MY_OFFICIAL_WABA_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.MATCH_001',
                      type: 'text',
                      text: { body: 'Should be processed' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const messages = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.externalMessageId).toBe('wamid.MATCH_001');
    });

    it('should filter out changes that do not match configured WHATSAPP_PHONE_NUMBER_ID', () => {
      vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', 'MY_PHONE_NUMBER_ID');

      const payload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '12345',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'FOREIGN_PHONE_ID',
                  },
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.FOREIGN_PHONE_MSG',
                      type: 'text',
                      text: { body: 'Ignored phone change' },
                    },
                  ],
                },
              },
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    phone_number_id: 'MY_PHONE_NUMBER_ID',
                  },
                  messages: [
                    {
                      from: '35799123456',
                      id: 'wamid.MATCH_PHONE_MSG',
                      type: 'text',
                      text: { body: 'Allowed phone change' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const messages = whatsAppAdapter.normalizeInboundPayload(payload);
      expect(messages.length).toBe(1);
      expect(messages[0]?.externalMessageId).toBe('wamid.MATCH_PHONE_MSG');
    });
  });

  describe('sendOutboundMessage', () => {
    it('should generate simulated externalMessageId in mock mode', async () => {
      vi.stubEnv('PROVIDER_MODE', 'mock');

      const result = await whatsAppAdapter.sendOutboundMessage({
        conversationId: 'conv-123',
        recipientIdentifier: '+35799445566',
        body: 'Mock outbound reply',
      });

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toMatch(/^wa_out_\d+_[a-f0-9]{8}$/);
      expect(result.details?.simulated).toBe(true);
    });

    it('should fail closed in live mode when credentials are missing', async () => {
      vi.stubEnv('PROVIDER_MODE', 'live');
      vi.stubEnv('WHATSAPP_PHONE_NUMBER_ID', '');
      vi.stubEnv('WHATSAPP_ACCESS_TOKEN', '');

      await expect(
        whatsAppAdapter.sendOutboundMessage({
          conversationId: 'conv-123',
          recipientIdentifier: '+35799445566',
          body: 'Live reply without config',
        }),
      ).rejects.toThrow('WhatsApp Cloud API is not configured or missing credentials in live mode');
    });
  });
});
