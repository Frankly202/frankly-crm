import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ChannelType, LeadStatus, LeadCategory, ActivityType } from '@prisma/client';

import whatsappFixture from '../../src/modules/webhooks/fixtures/whatsapp.fixture.json';
import instagramFixture from '../../src/modules/webhooks/fixtures/instagram.fixture.json';
import resendFixture from '../../src/modules/webhooks/fixtures/resend.fixture.json';
import websiteFixture from '../../src/modules/webhooks/fixtures/website.fixture.json';

describe('Webhooks & Inbound Channel Ingestion Integration', () => {
  const cleanupFixtures = async () => {
    await prisma.message.deleteMany({
      where: {
        externalMessageId: {
          in: [
            'wamid.HBgLMzU3OTk0NDU1NjYVAgASGBQzQTU5NzNGODk4MDhD',
            'm_mid.1458175510252:169d56789',
            'email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9',
            'email_rec_metadata_only_001',
            'web_submission_cyprus_2026_001',
            'auto_transition_msg_001',
          ],
        },
      },
    });

    await prisma.contact.deleteMany({
      where: {
        OR: [
          { primaryPhone: '+35799445566' },
          { instagramHandle: '@maria_limassol' },
          { primaryEmail: 'katerina.v@example.com' },
          { primaryEmail: 'metadata.client@example.com' },
          { primaryEmail: 'alex.christou@example.com' },
          { primaryEmail: 'auto.transition@example.com' },
        ],
      },
    });
  };

  beforeAll(async () => {
    await connectDatabase();
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await disconnectDatabase();
  });

  describe('Meta Verification Challenge Handshake', () => {
    it('should verify WhatsApp Meta challenge handshake with matching verify token', async () => {
      const response = await request(app).get('/api/v1/webhooks/whatsapp').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'frankly_test_verify_token',
        'hub.challenge': 'test_meta_challenge_12345',
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe('test_meta_challenge_12345');
    });

    it('should reject WhatsApp verification if verify token is incorrect', async () => {
      const response = await request(app).get('/api/v1/webhooks/whatsapp').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'test_meta_challenge_12345',
      });

      expect(response.status).toBe(401);
    });
  });

  describe('WhatsApp Inbound Processing', () => {
    it('should ingest WhatsApp webhook, resolve/create contact, thread conversation, and auto-create lead', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(whatsappFixture);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.processedCount).toBe(1);

      const msgResult = response.body.data.messages[0];
      expect(msgResult.deduplicated).toBe(false);

      // Verify Contact was created with normalized phone
      const contact = await prisma.contact.findUnique({
        where: { primaryPhone: '+35799445566' },
      });
      expect(contact).toBeDefined();
      expect(contact?.name).toBe('Costas Demetriou');

      // Verify Conversation was created
      const conversation = await prisma.conversation.findFirst({
        where: { contactId: contact!.id, channel: ChannelType.WHATSAPP },
      });
      expect(conversation).toBeDefined();

      // Verify Lead was created with NEW status
      const lead = await prisma.lead.findUnique({
        where: { id: conversation!.leadId! },
      });
      expect(lead).toBeDefined();
      expect(lead?.status).toBe(LeadStatus.NEW);
      expect(lead?.sourceChannel).toBe(ChannelType.WHATSAPP);

      // Verify Message was persisted
      const message = await prisma.message.findUnique({
        where: { externalMessageId: 'wamid.HBgLMzU3OTk0NDU1NjYVAgASGBQzQTU5NzNGODk4MDhD' },
      });
      expect(message).toBeDefined();
      expect(message?.body).toContain('student accommodation in Nicosia');

      // Verify activity logs
      const activities = await prisma.activityLog.findMany({
        where: { leadId: lead!.id },
      });
      expect(activities.some((a) => a.type === ActivityType.LEAD_CREATED)).toBe(true);
      expect(activities.some((a) => a.type === ActivityType.MESSAGE_RECEIVED)).toBe(true);
    });

    it('should deduplicate retransmitted WhatsApp messages without creating duplicate records', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(whatsappFixture);

      expect(response.status).toBe(200);
      expect(response.body.data.messages[0].deduplicated).toBe(true);

      const messagesCount = await prisma.message.count({
        where: { externalMessageId: 'wamid.HBgLMzU3OTk0NDU1NjYVAgASGBQzQTU5NzNGODk4MDhD' },
      });
      expect(messagesCount).toBe(1);
    });
  });

  describe('Instagram Inbound Processing', () => {
    it('should ingest Instagram messaging webhook and resolve contact by Instagram handle', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/instagram')
        .set('x-local-fixture-test', 'true')
        .send(instagramFixture);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const contact = await prisma.contact.findUnique({
        where: { instagramHandle: '@maria_limassol' },
      });
      expect(contact).toBeDefined();

      const conversation = await prisma.conversation.findFirst({
        where: { contactId: contact!.id, channel: ChannelType.INSTAGRAM },
      });
      expect(conversation).toBeDefined();
      expect(conversation?.leadId).toBeDefined();
    });
  });

  describe('Resend Email Inbound Processing', () => {
    it('should ingest Resend email webhook and resolve contact by email address', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/resend')
        .set('x-local-fixture-test', 'true')
        .send(resendFixture);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const contact = await prisma.contact.findUnique({
        where: { primaryEmail: 'katerina.v@example.com' },
      });
      expect(contact).toBeDefined();
      expect(contact?.name).toBe('Katerina Vanezi');

      const message = await prisma.message.findUnique({
        where: { externalMessageId: 'email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9' },
      });
      expect(message).toBeDefined();
      expect(message?.senderIdentifier).toBe('katerina.v@example.com');
    });

    it('should deduplicate retransmitted Resend email webhooks without creating duplicate records', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/resend')
        .set('x-local-fixture-test', 'true')
        .send(resendFixture);

      expect(response.status).toBe(200);
      expect(response.body.data.messages[0].deduplicated).toBe(true);

      const messageCount = await prisma.message.count({
        where: { externalMessageId: 'email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9' },
      });
      expect(messageCount).toBe(1);
    });

    it('should fetch email body from Receiving API and ingest message when webhook is metadata-only', async () => {
      const metadataOnlyPayload = {
        type: 'email.received',
        created_at: '2026-09-08T15:00:00.000Z',
        data: {
          email_id: 'email_rec_metadata_only_001',
          from: 'Metadata Client <metadata.client@example.com>',
          to: ['emmanuel@frankedu-global.com'],
          subject: 'Receiving API Integration Test',
        },
      };

      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'email_rec_metadata_only_001',
          text: 'This body was fetched from the Resend Receiving API.',
          html: '<p>This body was fetched from the Resend Receiving API.</p>',
          subject: 'Receiving API Integration Test',
          headers: {
            'Message-ID': '<inbound-rfc-001@example.com>',
            'In-Reply-To': '<prior-parent@example.com>',
            'References': '<root-000@example.com>',
          },
        }),
      } as unknown as Response);

      try {
        const response = await request(app)
          .post('/api/v1/webhooks/resend')
          .set('x-local-fixture-test', 'true')
          .send(metadataOnlyPayload);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const message = await prisma.message.findUnique({
          where: { externalMessageId: 'email_rec_metadata_only_001' },
        });
        expect(message).toBeDefined();
        expect(message?.body).toBe('This body was fetched from the Resend Receiving API.');
        expect(message?.senderIdentifier).toBe('metadata.client@example.com');
        expect(message?.subject).toBe('Receiving API Integration Test');
        expect(message?.rfcMessageId).toBe('<inbound-rfc-001@example.com>');
        expect(message?.inReplyTo).toBe('<prior-parent@example.com>');
        expect(message?.references).toBe('<root-000@example.com>');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Website Enquiry Form Inbound Processing', () => {
    it('should ingest website form, map requested category, and create lead', async () => {
      const response = await request(app).post('/api/v1/webhooks/website').send(websiteFixture);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const contact = await prisma.contact.findUnique({
        where: { primaryEmail: 'alex.christou@example.com' },
      });
      expect(contact).toBeDefined();
      expect(contact?.primaryPhone).toBe('+35799778899');

      const lead = await prisma.lead.findFirst({
        where: { contactId: contact!.id },
      });
      expect(lead).toBeDefined();
      expect(lead?.category).toBe(LeadCategory.PROPERTY_BUYER_INVESTOR);
    });

    it('should silently drop bot submissions when honeypot field is filled', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/website')
        .send({
          ...websiteFixture,
          submissionId: 'spam_bot_submission_001',
          _hp_company: 'Spam Bot LLC',
        });

      // Verification fails or returns 0 processed
      expect(response.status).toBe(401);
    });
  });

  describe('Lead Auto-Transition: CONTACTED -> REPLIED', () => {
    it('should automatically transition lead status to REPLIED when client sends inbound response', async () => {
      // 1. Create a contact and a lead in CONTACTED status
      const contact = await prisma.contact.create({
        data: {
          name: 'Auto Transition Client',
          primaryEmail: 'auto.transition@example.com',
          primaryPhone: '+35799554433',
        },
      });

      const lead = await prisma.lead.create({
        data: {
          title: 'Initial Property Consultation',
          category: LeadCategory.PROPERTY_BUYER_INVESTOR,
          status: LeadStatus.CONTACTED,
          contactId: contact.id,
        },
      });

      // 2. Client replies via WhatsApp
      const replyPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '100000000000001',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  contacts: [{ profile: { name: 'Auto Transition Client' }, wa_id: '35799554433' }],
                  messages: [
                    {
                      from: '35799554433',
                      id: 'auto_transition_msg_001',
                      timestamp: `${Math.floor(Date.now() / 1000)}`,
                      text: { body: 'Yes Frankly, I received your email and I am interested!' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(replyPayload);

      expect(response.status).toBe(200);

      // 3. Verify lead status automatically transitioned to REPLIED
      const updatedLead = await prisma.lead.findUnique({
        where: { id: lead.id },
      });
      expect(updatedLead?.status).toBe(LeadStatus.REPLIED);

      // 4. Verify STATUS_CHANGED activity log was recorded
      const statusActivity = await prisma.activityLog.findFirst({
        where: {
          leadId: lead.id,
          type: ActivityType.STATUS_CHANGED,
        },
      });
      expect(statusActivity).toBeDefined();
      expect(statusActivity?.description).toContain('REPLIED');
    });
  });

  describe('Concurrent Webhook Delivery & Idempotency Safety (Phase 2)', () => {
    it('should safely handle concurrent identical webhook deliveries without 500 errors', async () => {
      const concurrentExternalId = `wamid.CONCURRENT_${Date.now()}`;
      const concurrentPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '35722000000',
                    phone_number_id: 'PHONE_NUMBER_ID',
                  },
                  contacts: [
                    {
                      profile: { name: 'Concurrent Test Client' },
                      wa_id: '35799887766',
                    },
                  ],
                  messages: [
                    {
                      from: '35799887766',
                      id: concurrentExternalId,
                      timestamp: '1725900000',
                      text: { body: 'Testing concurrent delivery safety' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      // Fire 2 concurrent requests simultaneously
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/webhooks/whatsapp')
          .set('x-local-fixture-test', 'true')
          .send(concurrentPayload),
        request(app)
          .post('/api/v1/webhooks/whatsapp')
          .set('x-local-fixture-test', 'true')
          .send(concurrentPayload),
      ]);

      // Both must succeed with 200 OK (no unhandled P2002 HTTP 500)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Exactly one must have deduplicated: false and the other deduplicated: true
      const deduplicatedFlags = [
        res1.body.data.messages[0].deduplicated,
        res2.body.data.messages[0].deduplicated,
      ];
      expect(deduplicatedFlags).toContain(false);
      expect(deduplicatedFlags).toContain(true);

      // Database message count for this external ID must be exactly 1
      const count = await prisma.message.count({
        where: { externalMessageId: concurrentExternalId },
      });
      expect(count).toBe(1);

      // Cleanup
      const contact = await prisma.contact.findUnique({
        where: { primaryPhone: '+35799887766' },
      });
      if (contact) {
        await prisma.message.deleteMany({ where: { conversation: { contactId: contact.id } } });
        await prisma.conversation.deleteMany({ where: { contactId: contact.id } });
        await prisma.activityLog.deleteMany({ where: { lead: { contactId: contact.id } } });
        await prisma.lead.deleteMany({ where: { contactId: contact.id } });
        await prisma.contact.delete({ where: { id: contact.id } });
      }
    });

    it('should create exactly one conversation thread when two distinct messages arrive concurrently for a new contact (Phase 4)', async () => {
      const now = Date.now();
      const concurrentPhone = '35799776655';
      const msgId1 = `wamid.THREAD_CONC_1_${now}`;
      const msgId2 = `wamid.THREAD_CONC_2_${now}`;

      const buildPayload = (msgId: string, body: string, timestamp: string) => ({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '35722000000',
                    phone_number_id: 'PHONE_NUMBER_ID',
                  },
                  contacts: [
                    {
                      profile: { name: 'Concurrent Thread Customer' },
                      wa_id: concurrentPhone,
                    },
                  ],
                  messages: [
                    {
                      from: concurrentPhone,
                      id: msgId,
                      timestamp,
                      text: { body },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      // Fire 2 concurrent distinct messages for a brand-new contact
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/webhooks/whatsapp')
          .set('x-local-fixture-test', 'true')
          .send(buildPayload(msgId1, 'First concurrent message', '1725900001')),
        request(app)
          .post('/api/v1/webhooks/whatsapp')
          .set('x-local-fixture-test', 'true')
          .send(buildPayload(msgId2, 'Second concurrent message', '1725900002')),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res2.body.success).toBe(true);

      // Both distinct messages should be stored and processed (neither is a duplicate of the other)
      expect(res1.body.data.messages[0].deduplicated).toBe(false);
      expect(res2.body.data.messages[0].deduplicated).toBe(false);

      // Verify contact
      const contact = await prisma.contact.findUnique({
        where: { primaryPhone: `+${concurrentPhone}` },
      });
      expect(contact).toBeDefined();

      // Verify exactly ONE conversation thread was created for this contact & channel
      const conversations = await prisma.conversation.findMany({
        where: { contactId: contact!.id, channel: ChannelType.WHATSAPP },
      });
      expect(conversations.length).toBe(1);

      // Verify both messages are attached to the SAME single conversation
      const messages = await prisma.message.findMany({
        where: {
          externalMessageId: { in: [msgId1, msgId2] },
        },
      });
      expect(messages.length).toBe(2);
      expect(messages[0]!.conversationId).toBe(conversations[0]!.id);
      expect(messages[1]!.conversationId).toBe(conversations[0]!.id);

      // Cleanup
      await prisma.message.deleteMany({
        where: { conversationId: conversations[0]!.id },
      });
      await prisma.conversation.deleteMany({
        where: { contactId: contact!.id },
      });
      await prisma.activityLog.deleteMany({
        where: { lead: { contactId: contact!.id } },
      });
      await prisma.lead.deleteMany({
        where: { contactId: contact!.id },
      });
      await prisma.contact.delete({
        where: { id: contact!.id },
      });
    });
  });

  describe('Security & Fail-Closed Signature Verification', () => {
    it('should fail closed with 401 when signature is invalid or tampered with secret set', async () => {
      process.env['META_APP_SECRET'] = 'real_configured_secret_for_test';

      const response = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set(
          'x-hub-signature-256',
          'sha256=invalid_tampered_hash_that_fails_cryptographic_verification_12345',
        )
        .send(whatsappFixture);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');

      delete process.env['META_APP_SECRET'];
    });
  });
});
