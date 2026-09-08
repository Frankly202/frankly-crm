import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ChannelType, LeadStatus, LeadCategory, ActivityType } from '@prisma/client';

import whatsappFixture from '../../src/modules/webhooks/fixtures/whatsapp.fixture.json';
import instagramFixture from '../../src/modules/webhooks/fixtures/instagram.fixture.json';
import resendFixture from '../../src/modules/webhooks/fixtures/resend.fixture.json';
import websiteFixture from '../../src/modules/webhooks/fixtures/website.fixture.json';

describe('Webhooks & Inbound Channel Ingestion Integration', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    // Clean up contacts and leads created during webhook tests
    await prisma.message.deleteMany({
      where: {
        externalMessageId: {
          in: [
            'wamid.HBgLMzU3OTk0NDU1NjYVAgASGBQzQTU5NzNGODk4MDhD',
            'm_mid.1458175510252:169d56789',
            'email_rec_01J8K9L0M1N2P3Q4R5S6T7U8V9',
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
          { primaryEmail: 'alex.christou@example.com' },
          { primaryEmail: 'auto.transition@example.com' },
        ],
      },
    });

    await disconnectDatabase();
  });

  describe('Meta Verification Challenge Handshake', () => {
    it('should verify WhatsApp Meta challenge handshake with matching verify token', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks/whatsapp')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'frankly_test_verify_token',
          'hub.challenge': 'test_meta_challenge_12345',
        });

      expect(response.status).toBe(200);
      expect(response.text).toBe('test_meta_challenge_12345');
    });

    it('should reject WhatsApp verification if verify token is incorrect', async () => {
      const response = await request(app)
        .get('/api/v1/webhooks/whatsapp')
        .query({
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
  });

  describe('Website Enquiry Form Inbound Processing', () => {
    it('should ingest website form, map requested category, and create lead', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks/website')
        .send(websiteFixture);

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
