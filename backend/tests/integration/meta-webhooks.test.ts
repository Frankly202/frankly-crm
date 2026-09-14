import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ChannelType, MessageDirection, MessageStatus, LeadCategory, LeadStatus } from '@prisma/client';

import deliveredFixture from '../../src/modules/webhooks/fixtures/whatsapp-status-delivered.fixture.json';
import readFixture from '../../src/modules/webhooks/fixtures/whatsapp-status-read.fixture.json';
import failedFixture from '../../src/modules/webhooks/fixtures/whatsapp-status-failed.fixture.json';

describe('Meta Webhooks Ingress & Status Tracking Integration Tests', () => {
  const testWamid = 'wamid.STATUS_TEST_001';
  const testPhone = '+35799881122';
  let testContactId: string;
  let testConversationId: string;
  let testLeadId: string;


  const cleanupDatabase = async () => {
    await prisma.message.deleteMany({
      where: { externalMessageId: testWamid },
    });
    await prisma.conversation.deleteMany({
      where: { channelThreadId: testPhone },
    });
    await prisma.lead.deleteMany({
      where: { contact: { primaryPhone: testPhone } },
    });
    await prisma.contact.deleteMany({
      where: { primaryPhone: testPhone },
    });
  };

  beforeAll(async () => {
    await connectDatabase();
    await cleanupDatabase();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();

    // Create test contact, lead, and conversation
    const contact = await prisma.contact.create({
      data: {
        name: 'Costas Demetriou',
        primaryPhone: testPhone,
      },
    });
    testContactId = contact.id;

    const lead = await prisma.lead.create({
      data: {
        title: 'WhatsApp Inquiry: Costas Demetriou',
        category: LeadCategory.STUDY_ABROAD_STUDENT,
        status: LeadStatus.CONTACTED,
        sourceChannel: ChannelType.WHATSAPP,
        contactId: testContactId,
      },
    });
    testLeadId = lead.id;

    const conversation = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.WHATSAPP,
        channelThreadId: testPhone,
      },
    });
    testConversationId = conversation.id;
  });

  describe('GET Challenge Handshakes', () => {
    it('should verify WhatsApp challenge with valid verify_token', async () => {
      const res = await request(app).get('/api/v1/webhooks/whatsapp').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'frankly_test_verify_token',
        'hub.challenge': 'whatsapp_challenge_123',
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe('whatsapp_challenge_123');
    });

    it('should verify Instagram challenge with valid verify_token', async () => {
      const res = await request(app).get('/api/v1/webhooks/instagram').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'frankly_test_verify_token',
        'hub.challenge': 'instagram_challenge_456',
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe('instagram_challenge_456');
    });

    it('should verify Messenger challenge with valid verify_token', async () => {
      const res = await request(app).get('/api/v1/webhooks/messenger').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'frankly_test_verify_token',
        'hub.challenge': 'messenger_challenge_789',
      });

      expect(res.status).toBe(200);
      expect(res.text).toBe('messenger_challenge_789');
    });

    it('should reject challenge with invalid verify_token (401)', async () => {
      const res = await request(app).get('/api/v1/webhooks/whatsapp').query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'test_challenge',
      });

      expect(res.status).toBe(401);
    });

    it('should reject challenge with invalid mode (400)', async () => {
      const res = await request(app).get('/api/v1/webhooks/whatsapp').query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'frankly_test_verify_token',
        'hub.challenge': 'test_challenge',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST Webhook Signature Validation', () => {
    it('should reject webhook request when HMAC signature is invalid', async () => {
      const payloadString = JSON.stringify(deliveredFixture);
      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', 'sha256=invalid_signature_hex_code')
        .send(payloadString);

      expect(res.status).toBe(401);
    });

    it('should accept webhook request with valid HMAC signature', async () => {
      // Seed initial SENT message
      await prisma.message.create({
        data: {
          conversationId: testConversationId,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          body: 'Hello Costas!',
          senderIdentifier: 'Frankly CRM',
          recipientIdentifier: testPhone,
          externalMessageId: testWamid,
        },
      });

      const testSecret = 'meta_test_secret_for_integration';
      process.env['META_APP_SECRET'] = testSecret;

      const payloadString = JSON.stringify(deliveredFixture);
      const signature = `sha256=${crypto
        .createHmac('sha256', testSecret)
        .update(Buffer.from(payloadString))
        .digest('hex')}`;

      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('x-hub-signature-256', signature)
        .send(payloadString);

      delete process.env['META_APP_SECRET'];

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statuses.length).toBe(1);
    });
  });

  describe('WhatsApp Status Receipts & Message.status Transitions', () => {
    it('should transition message status from SENT to DELIVERED upon delivery receipt', async () => {
      // Seed initial SENT message
      const initialMessage = await prisma.message.create({
        data: {
          conversationId: testConversationId,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          body: 'Hello Costas, here is the student housing information.',
          senderIdentifier: 'Frankly CRM',
          recipientIdentifier: testPhone,
          externalMessageId: testWamid,
        },
      });

      expect(initialMessage.status).toBe(MessageStatus.SENT);

      // Ingest delivered status receipt
      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(deliveredFixture);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statuses[0]?.status).toBe('DELIVERED');
      expect(res.body.data.statuses[0]?.rawStatus).toBe('delivered');

      // Verify in database
      const updatedMessage = await prisma.message.findUnique({
        where: { id: initialMessage.id },
      });

      expect(updatedMessage?.status).toBe(MessageStatus.DELIVERED);
      const payload = updatedMessage?.rawPayload as Record<string, unknown>;
      expect(payload?.deliveredAt).toBeDefined();
    });

    it('should record read receipt timestamp on message idempotently', async () => {
      // Seed DELIVERED message
      const initialMessage = await prisma.message.create({
        data: {
          conversationId: testConversationId,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.DELIVERED,
          body: 'Hello Costas!',
          senderIdentifier: 'Frankly CRM',
          recipientIdentifier: testPhone,
          externalMessageId: testWamid,
        },
      });

      // Ingest read status receipt
      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(readFixture);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedMessage = await prisma.message.findUnique({
        where: { id: initialMessage.id },
      });

      expect(updatedMessage?.status).toBe(MessageStatus.DELIVERED);
      const payload = updatedMessage?.rawPayload as Record<string, unknown>;
      expect(payload?.readAt).toBeDefined();

      // Duplicate read receipt: verify idempotency
      const dupRes = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(readFixture);

      expect(dupRes.status).toBe(200);
      const recheckedMessage = await prisma.message.findUnique({
        where: { id: initialMessage.id },
      });
      expect(recheckedMessage?.status).toBe(MessageStatus.DELIVERED);
    });

    it('should transition message status to FAILED and record error details upon failure receipt', async () => {
      // Seed SENT message
      const initialMessage = await prisma.message.create({
        data: {
          conversationId: testConversationId,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.SENT,
          body: 'Hello Costas!',
          senderIdentifier: 'Frankly CRM',
          recipientIdentifier: testPhone,
          externalMessageId: testWamid,
        },
      });

      // Ingest failed status receipt
      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(failedFixture);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statuses[0]?.status).toBe('FAILED');
      expect(res.body.data.statuses[0]?.rawStatus).toBe('failed');

      // Verify in database
      const updatedMessage = await prisma.message.findUnique({
        where: { id: initialMessage.id },
      });

      expect(updatedMessage?.status).toBe(MessageStatus.FAILED);
      const payload = updatedMessage?.rawPayload as Record<string, unknown>;
      expect(payload?.failedAt).toBeDefined();
      expect(payload?.failureReason).toContain('More than 24 hours have passed');
    });

    it('should safely handle status receipt for non-existent message ID without error', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/whatsapp')
        .set('x-local-fixture-test', 'true')
        .send(deliveredFixture);

      // No message in DB with testWamid exists yet
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.statuses).toEqual([]);
    });
  });

  describe('Messenger Route Handling', () => {
    it('should return 501 with informative code for POST /messenger in Phase 1', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/messenger')
        .send({ object: 'page', entry: [] });

      expect(res.status).toBe(501);
      expect(res.body.error?.code).toBe('CHANNEL_NOT_YET_ENABLED');
    });
  });
});
