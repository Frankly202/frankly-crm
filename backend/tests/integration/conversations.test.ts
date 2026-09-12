import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ChannelType, MessageDirection, MessageStatus, ActivityType } from '@prisma/client';

describe('Conversations API Integration', () => {
  let adminToken: string;
  let testContactId: string;
  let testLeadId: string;
  let testConversationId: string;

  beforeAll(async () => {
    await connectDatabase();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com',
        password: process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!',
      });
    adminToken = loginRes.body.data.accessToken;

    // Clean up any test fixtures from previous runs
    await prisma.contact.deleteMany({
      where: {
        primaryEmail: {
          in: ['conv.test@example.com', 'email.threading@example.com'],
        },
      },
    });

    // Create test contact, lead, and conversation with an inbound message
    const contact = await prisma.contact.create({
      data: {
        name: 'Conversation Test Contact',
        primaryEmail: 'conv.test@example.com',
        primaryPhone: '+35799112233',
      },
    });
    testContactId = contact.id;

    const lead = await prisma.lead.create({
      data: {
        title: 'Conversation Test Lead',
        category: 'STUDY_ABROAD_STUDENT',
        status: 'NEW',
        contactId: contact.id,
      },
    });
    testLeadId = lead.id;

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: ChannelType.WHATSAPP,
        channelThreadId: '+35799112233',
        lastMessageAt: new Date(),
        lastReadAt: null, // initially unread
      },
    });
    testConversationId = conversation.id;

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Initial test inbound message from student.',
        senderIdentifier: '+35799112233',
        recipientIdentifier: '+35799000000',
        externalMessageId: 'conv_inbound_msg_001',
      },
    });
  });

  afterAll(async () => {
    await prisma.conversation.deleteMany({
      where: { id: testConversationId },
    });
    await prisma.lead.deleteMany({
      where: { id: testLeadId },
    });
    await prisma.contact.deleteMany({
      where: { id: testContactId },
    });
    await disconnectDatabase();
  });

  describe('GET /api/v1/conversations', () => {
    it('should reject unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/v1/conversations');
      expect(response.status).toBe(401);
    });

    it('should list conversations with pagination and isUnread indicator', async () => {
      const response = await request(app)
        .get('/api/v1/conversations?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);

      const targetConv = response.body.data.find(
        (c: { id: string }) => c.id === testConversationId,
      );
      expect(targetConv).toBeDefined();
      expect(targetConv.isUnread).toBe(true);
      expect(targetConv.contact.name).toBe('Conversation Test Contact');
      expect(targetConv.latestMessage).toBeDefined();
    });

    it('should filter conversations by channel', async () => {
      const response = await request(app)
        .get(`/api/v1/conversations?channel=${ChannelType.WHATSAPP}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      for (const conv of response.body.data) {
        expect(conv.channel).toBe(ChannelType.WHATSAPP);
      }
    });

    it('should accurately filter unread conversations across never-read, read-with-new-message, and read-with-no-new-message states', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // Dedicated contacts to comply with @@unique([contactId, channel])
      const contact1 = await prisma.contact.create({
        data: { name: 'Unread Test 1', primaryPhone: '+35799110001' },
      });
      const contact2 = await prisma.contact.create({
        data: { name: 'Unread Test 2', primaryPhone: '+35799110002' },
      });
      const contact3 = await prisma.contact.create({
        data: { name: 'Unread Test 3', primaryPhone: '+35799110003' },
      });

      // 1. Never read conversation
      const neverReadConv = await prisma.conversation.create({
        data: {
          contactId: contact1.id,
          channel: ChannelType.WHATSAPP,
          channelThreadId: '+35799110001',
          lastMessageAt: now,
          lastReadAt: null,
        },
      });

      // 2. Previously read conversation, but customer sent a new message afterwards
      const readWithNewMessageConv = await prisma.conversation.create({
        data: {
          contactId: contact2.id,
          channel: ChannelType.WHATSAPP,
          channelThreadId: '+35799110002',
          lastReadAt: oneHourAgo,
          lastMessageAt: now, // new message after lastReadAt
        },
      });

      // 3. Previously read conversation with no subsequent messages
      const readNoNewMessageConv = await prisma.conversation.create({
        data: {
          contactId: contact3.id,
          channel: ChannelType.WHATSAPP,
          channelThreadId: '+35799110003',
          lastMessageAt: twoHoursAgo,
          lastReadAt: now, // read is newer than last message
        },
      });

      try {
        const response = await request(app)
          .get('/api/v1/conversations?unreadOnly=true')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        const returnedIds = response.body.data.map((c: { id: string }) => c.id);

        // never-read MUST be included
        expect(returnedIds).toContain(neverReadConv.id);
        // read-with-new-message MUST be included
        expect(returnedIds).toContain(readWithNewMessageConv.id);
        // read-with-no-new-message MUST be excluded
        expect(returnedIds).not.toContain(readNoNewMessageConv.id);

        // Phase 5 bounded pagination test
        const page1Res = await request(app)
          .get('/api/v1/conversations?unreadOnly=true&page=1&limit=1')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(page1Res.status).toBe(200);
        expect(page1Res.body.data.length).toBe(1);
        expect(page1Res.body.meta.limit).toBe(1);
        expect(page1Res.body.meta.page).toBe(1);
        expect(page1Res.body.meta.total).toBeGreaterThanOrEqual(2);

        const page2Res = await request(app)
          .get('/api/v1/conversations?unreadOnly=true&page=2&limit=1')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(page2Res.status).toBe(200);
        expect(page2Res.body.data.length).toBe(1);
        expect(page2Res.body.meta.page).toBe(2);
        // Ensure page 1 and page 2 return distinct unread conversations
        expect(page1Res.body.data[0].id).not.toBe(page2Res.body.data[0].id);
      } finally {
        await prisma.conversation.deleteMany({
          where: {
            id: { in: [neverReadConv.id, readWithNewMessageConv.id, readNoNewMessageConv.id] },
          },
        });
        await prisma.contact.deleteMany({
          where: {
            id: { in: [contact1.id, contact2.id, contact3.id] },
          },
        });
      }
    });
  });

  describe('GET /api/v1/conversations/unread-count (Phase 5)', () => {
    it('should reject unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/v1/conversations/unread-count');
      expect(response.status).toBe(401);
    });

    it('should return accurate unread count and avoid route collision with GET /:id', async () => {
      const response = await request(app)
        .get('/api/v1/conversations/unread-count')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.unreadCount).toBe('number');
      // If it collided with /:id, it would return a conversation or 404
      expect(response.body.data.id).toBeUndefined();
    });

    it('should support channel filtering on unread-count', async () => {
      const response = await request(app)
        .get(`/api/v1/conversations/unread-count?channel=${ChannelType.WHATSAPP}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.unreadCount).toBe('number');
    });
  });

  describe('GET /api/v1/conversations/:id', () => {
    it('should return conversation detail and chronological message history', async () => {
      const response = await request(app)
        .get(`/api/v1/conversations/${testConversationId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testConversationId);
      expect(Array.isArray(response.body.data.messages)).toBe(true);
      expect(response.body.data.messages.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.contact.primaryPhone).toBe('+35799112233');
    });

    it('should return 404 for non-existent conversation ID', async () => {
      const response = await request(app)
        .get('/api/v1/conversations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/conversations/:id/messages', () => {
    it('should send outbound reply message and record activity log', async () => {
      const response = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          body: 'Hello! Frankly speaking, we can offer full support for admissions.',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.direction).toBe(MessageDirection.OUTBOUND);
      expect(response.body.data.status).toBe(MessageStatus.SENT);
      expect(response.body.data.body).toContain('admissions');

      // Verify activity log was recorded
      const activity = await prisma.activityLog.findFirst({
        where: {
          leadId: testLeadId,
          type: ActivityType.MESSAGE_SENT,
        },
      });
      expect(activity).toBeDefined();
    });

    it('should correctly thread email replies with In-Reply-To, References, and Re: subject', async () => {
      // Create an email conversation with an inbound email having an RFC Message-ID
      const emailContact = await prisma.contact.create({
        data: {
          name: 'Email Threading Contact',
          primaryEmail: 'email.threading@example.com',
        },
      });

      const emailLead = await prisma.lead.create({
        data: {
          title: 'Email Threading Lead',
          category: 'STUDY_ABROAD_STUDENT',
          status: 'NEW',
          contactId: emailContact.id,
        },
      });

      const emailConv = await prisma.conversation.create({
        data: {
          contactId: emailContact.id,
          leadId: emailLead.id,
          channel: ChannelType.RESEND_EMAIL,
          channelThreadId: 'email.threading@example.com',
          lastMessageAt: new Date(),
        },
      });

      await prisma.message.create({
        data: {
          conversationId: emailConv.id,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.RECEIVED,
          body: 'Inquiry about university scholarship',
          subject: 'University Scholarship Inquiry',
          rfcMessageId: '<rfc-parent-12345@example.com>',
          references: '<rfc-root-00001@example.com>',
          senderIdentifier: 'email.threading@example.com',
          recipientIdentifier: 'emmanuel@frankedu-global.com',
          externalMessageId: 'email_ext_thread_001',
        },
      });

      const replyRes = await request(app)
        .post(`/api/v1/conversations/${emailConv.id}/messages`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          body: 'Here are the scholarship details for your chosen university.',
        });

      expect(replyRes.status).toBe(201);
      expect(replyRes.body.success).toBe(true);
      expect(replyRes.body.data.subject).toBe('Re: University Scholarship Inquiry');
      expect(replyRes.body.data.inReplyTo).toBe('<rfc-parent-12345@example.com>');
      expect(replyRes.body.data.references).toBe(
        '<rfc-root-00001@example.com> <rfc-parent-12345@example.com>',
      );

      // Cleanup
      await prisma.conversation.delete({ where: { id: emailConv.id } });
      await prisma.lead.delete({ where: { id: emailLead.id } });
      await prisma.contact.delete({ where: { id: emailContact.id } });
    });
  });

  describe('POST /api/v1/conversations/start-email', () => {
    let createdConvId: string | null = null;
    let createdContactId: string | null = null;
    let createdLeadId: string | null = null;

    afterAll(async () => {
      if (createdConvId) {
        await prisma.conversation.deleteMany({ where: { id: createdConvId } });
      }
      if (createdLeadId) {
        await prisma.lead.deleteMany({ where: { id: createdLeadId } });
      }
      if (createdContactId) {
        await prisma.contact.deleteMany({ where: { id: createdContactId } });
      }
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app).post('/api/v1/conversations/start-email').send({
        to: 'newclient@example.com',
        subject: 'Hello',
        body: 'World',
      });
      expect(res.status).toBe(401);
    });

    it('should reject self-send to system email addresses with 400', async () => {
      const res = await request(app)
        .post('/api/v1/conversations/start-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          to: 'emmanuel@frankedu-global.com',
          subject: 'Self send test',
          body: 'This should be rejected',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('system address');
    });

    it('should successfully initiate a new outbound email conversation', async () => {
      const testKey = `idem_int_${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/conversations/start-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          to: 'brandnew.client@example.com',
          recipientName: 'Brand New Client',
          subject: 'Exclusive Cyprus Real Estate Portfolio',
          body: 'Dear Client, please find our newly released property portfolio.',
          leadCategory: 'PROPERTY_BUYER_INVESTOR',
          idempotencyKey: testKey,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversationId).toBeDefined();
      expect(res.body.data.messageId).toBeDefined();
      expect(res.body.data.status).toBe(MessageStatus.SENT);

      createdConvId = res.body.data.conversationId;

      // Verify contact, lead, and conversation were created
      const conv = await prisma.conversation.findUnique({
        where: { id: createdConvId! },
        include: { contact: true, lead: true, messages: true },
      });
      expect(conv).toBeDefined();
      expect(conv?.contact.primaryEmail).toBe('brandnew.client@example.com');
      expect(conv?.contact.name).toBe('Brand New Client');
      expect(conv?.lead?.category).toBe('PROPERTY_BUYER_INVESTOR');
      expect(conv?.lead?.status).toBe('CONTACTED');

      createdContactId = conv?.contactId || null;
      createdLeadId = conv?.leadId || null;

      // Verify message fields
      const msg = conv?.messages.find((m) => m.id === res.body.data.messageId);
      expect(msg?.subject).toBe('Exclusive Cyprus Real Estate Portfolio');
      expect(msg?.idempotencyKey).toBe(testKey);
      expect(msg?.direction).toBe(MessageDirection.OUTBOUND);
      expect(msg?.status).toBe(MessageStatus.SENT);
    });

    it('should return deduplicated response when retried with same idempotency key', async () => {
      const testKey = `idem_dedup_${Date.now()}`;
      const firstRes = await request(app)
        .post('/api/v1/conversations/start-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          to: 'dedup.client@example.com',
          recipientName: 'Dedup Client',
          subject: 'Dedup Test',
          body: 'First submission',
          idempotencyKey: testKey,
        });

      expect(firstRes.status).toBe(201);
      const firstMessageId = firstRes.body.data.messageId;

      const secondRes = await request(app)
        .post('/api/v1/conversations/start-email')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          to: 'dedup.client@example.com',
          recipientName: 'Dedup Client',
          subject: 'Dedup Test',
          body: 'Second submission (duplicate)',
          idempotencyKey: testKey,
        });

      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.deduplicated).toBe(true);
      expect(secondRes.body.data.messageId).toBe(firstMessageId);

      // Cleanup
      await prisma.conversation.deleteMany({ where: { id: firstRes.body.data.conversationId } });
      await prisma.contact.deleteMany({ where: { primaryEmail: 'dedup.client@example.com' } });
    });
  });

  describe('PATCH /api/v1/conversations/:id/read', () => {
    it('should mark conversation as read and update lastReadAt', async () => {
      const response = await request(app)
        .patch(`/api/v1/conversations/${testConversationId}/read`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isUnread).toBe(false);
      expect(response.body.data.lastReadAt).toBeDefined();

      // Verify conversation in DB is marked read
      const updated = await prisma.conversation.findUnique({
        where: { id: testConversationId },
      });
      expect(updated?.lastReadAt).toBeDefined();
    });
  });
});

