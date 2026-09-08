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

      // 1. Never read conversation
      const neverReadConv = await prisma.conversation.create({
        data: {
          contactId: testContactId,
          channel: ChannelType.WHATSAPP,
          channelThreadId: '+35799110001',
          lastMessageAt: now,
          lastReadAt: null,
        },
      });

      // 2. Previously read conversation, but customer sent a new message afterwards
      const readWithNewMessageConv = await prisma.conversation.create({
        data: {
          contactId: testContactId,
          channel: ChannelType.WHATSAPP,
          channelThreadId: '+35799110002',
          lastReadAt: oneHourAgo,
          lastMessageAt: now, // new message after lastReadAt
        },
      });

      // 3. Previously read conversation with no subsequent messages
      const readNoNewMessageConv = await prisma.conversation.create({
        data: {
          contactId: testContactId,
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
      } finally {
        await prisma.conversation.deleteMany({
          where: {
            id: { in: [neverReadConv.id, readWithNewMessageConv.id, readNoNewMessageConv.id] },
          },
        });
      }
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
