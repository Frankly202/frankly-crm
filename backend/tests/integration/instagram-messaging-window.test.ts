import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { ChannelType, MessageDirection, MessageStatus, LeadCategory } from '@prisma/client';
import { signAccessToken } from '../../src/common/utils/token.util.js';

describe('Instagram 7-Day Customer Service Window Integration Tests', () => {
  const testIgsid = '17841459201934812';
  const testHandle = '@ig_test_user_paphos';
  let adminToken: string;
  let testContactId: string;
  let testLeadId: string;

  const cleanupDatabase = async () => {
    await prisma.message.deleteMany({
      where: {
        OR: [
          { senderIdentifier: testIgsid },
          { recipientIdentifier: testIgsid },
        ],
      },
    });
    await prisma.conversation.deleteMany({
      where: { channelThreadId: testIgsid },
    });
    await prisma.lead.deleteMany({
      where: { contact: { instagramHandle: testHandle } },
    });
    await prisma.contact.deleteMany({
      where: { instagramHandle: testHandle },
    });
  };

  beforeAll(async () => {
    await connectDatabase();
    await cleanupDatabase();

    const adminUser = await prisma.user.findFirst({
      where: { email: 'emmanuel@frankedu-global.com' },
    });
    if (!adminUser) {
      throw new Error('Seeded admin user not found for integration testing');
    }

    adminToken = signAccessToken({
      userId: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });
  });

  afterAll(async () => {
    await cleanupDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    await cleanupDatabase();

    // Create baseline test contact and lead
    const contact = await prisma.contact.create({
      data: {
        name: 'Maria Limassol',
        instagramHandle: testHandle,
      },
    });
    testContactId = contact.id;

    const lead = await prisma.lead.create({
      data: {
        title: 'Instagram Paphos Villa Inquiry',
        category: LeadCategory.PROPERTY_BUYER_INVESTOR,
        contactId: contact.id,
      },
    });
    testLeadId = lead.id;
  });

  it('should return window open (standard <24h) when customer sent message 2 hours ago and allow outbound reply', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const conv = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.INSTAGRAM,
        channelThreadId: testIgsid,
        lastMessageAt: twoHoursAgo,
      },
    });

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Can you send photos of the seafront villas?',
        senderIdentifier: testIgsid,
        recipientIdentifier: '17841400000000001',
        externalMessageId: 'm_mid_ig_int_001',
        createdAt: twoHoursAgo,
        rawPayload: {
          timestamp: Math.floor(twoHoursAgo.getTime() / 1000),
        },
      },
    });

    // 1. Verify GET /api/v1/conversations/:id reflects standard open window
    const detailRes = await request(app)
      .get(`/api/v1/conversations/${conv.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.messagingWindow).toBeDefined();
    expect(detailRes.body.data.messagingWindow.isOpen).toBe(true);
    expect(detailRes.body.data.messagingWindow.isHumanAgentWindow).toBe(false);
    expect(detailRes.body.data.messagingWindow.expiresAt).toBeDefined();

    // 2. Dispatch outbound reply from Inbox
    const replyRes = await request(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Here are the floorplans and photos of the villas in Paphos.',
      });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.success).toBe(true);
    expect(replyRes.body.data.direction).toBe(MessageDirection.OUTBOUND);
    expect(replyRes.body.data.status).toBe(MessageStatus.SENT);
    expect(replyRes.body.data.recipientIdentifier).toBe(testIgsid);

    // Verify DB message record
    const savedMsg = await prisma.message.findUnique({
      where: { id: replyRes.body.data.id },
    });
    expect(savedMsg).toBeDefined();
    expect(savedMsg?.direction).toBe(MessageDirection.OUTBOUND);
    expect(savedMsg?.recipientIdentifier).toBe(testIgsid);
  });

  it('should return window open with isHumanAgentWindow=true when customer message is 3 days old (24h to 7d) and allow reply', async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const conv = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.INSTAGRAM,
        channelThreadId: testIgsid,
        lastMessageAt: threeDaysAgo,
      },
    });

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Any 3-bedroom options available?',
        senderIdentifier: testIgsid,
        recipientIdentifier: '17841400000000001',
        externalMessageId: 'm_mid_ig_int_002',
        createdAt: threeDaysAgo,
        rawPayload: {
          timestamp: Math.floor(threeDaysAgo.getTime() / 1000),
        },
      },
    });

    // 1. Verify GET /api/v1/conversations/:id reflects human agent window
    const detailRes = await request(app)
      .get(`/api/v1/conversations/${conv.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.messagingWindow.isOpen).toBe(true);
    expect(detailRes.body.data.messagingWindow.isHumanAgentWindow).toBe(true);

    // 2. Dispatch outbound reply
    const replyRes = await request(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Apologies for the slight delay! Yes, we have 2 units available.',
      });

    expect(replyRes.status).toBe(201);
    expect(replyRes.body.success).toBe(true);
    expect(replyRes.body.data.recipientIdentifier).toBe(testIgsid);
  });

  it('should reject outbound reply with 422 INSTAGRAM_WINDOW_EXPIRED when customer message is >7 days old', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

    const conv = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.INSTAGRAM,
        channelThreadId: testIgsid,
        lastMessageAt: eightDaysAgo,
      },
    });

    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Old inquiry from last week',
        senderIdentifier: testIgsid,
        recipientIdentifier: '17841400000000001',
        externalMessageId: 'm_mid_ig_int_003',
        createdAt: eightDaysAgo,
        rawPayload: {
          timestamp: Math.floor(eightDaysAgo.getTime() / 1000),
        },
      },
    });

    // 1. Verify GET /api/v1/conversations/:id indicates closed window
    const detailRes = await request(app)
      .get(`/api/v1/conversations/${conv.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.messagingWindow.isOpen).toBe(false);

    // 2. Attempting to reply must fail with 422
    const res = await request(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Reaching out after 8 days.',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INSTAGRAM_WINDOW_EXPIRED');
    expect(res.body.error.message).toContain('7d');
  });

  it('should reject outbound reply with 422 INSTAGRAM_WINDOW_EXPIRED when no customer inbound message exists', async () => {
    const conv = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.INSTAGRAM,
        channelThreadId: testIgsid,
      },
    });

    const res = await request(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Cold direct message attempt.',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INSTAGRAM_WINDOW_EXPIRED');
  });

  it('should never extend window from outbound messages', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const conv = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.INSTAGRAM,
        channelThreadId: testIgsid,
        lastMessageAt: oneHourAgo,
      },
    });

    // Inbound message 8 days ago
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Initial inquiry 8 days ago',
        senderIdentifier: testIgsid,
        recipientIdentifier: '17841400000000001',
        externalMessageId: 'm_mid_ig_int_004',
        createdAt: eightDaysAgo,
        rawPayload: {
          timestamp: Math.floor(eightDaysAgo.getTime() / 1000),
        },
      },
    });

    // Outbound message 1 hour ago
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.SENT,
        body: 'Previous outbound response',
        senderIdentifier: 'FranklyEdu Instagram',
        recipientIdentifier: testIgsid,
        externalMessageId: 'm_mid_ig_out_prev',
        createdAt: oneHourAgo,
      },
    });

    // Window must still be evaluated as expired because latest INBOUND is 8 days old
    const detailRes = await request(app)
      .get(`/api/v1/conversations/${conv.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(detailRes.body.data.messagingWindow.isOpen).toBe(false);

    const replyRes = await request(app)
      .post(`/api/v1/conversations/${conv.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Another outbound reply.',
      });

    expect(replyRes.status).toBe(422);
    expect(replyRes.body.error.code).toBe('INSTAGRAM_WINDOW_EXPIRED');
  });

  it('should reject outbound message if channelThreadId is missing or non-numeric', async () => {
    const invalidConv = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.INSTAGRAM,
        channelThreadId: 'invalid_non_numeric_thread',
      },
    });

    await prisma.message.create({
      data: {
        conversationId: invalidConv.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Inbound message from invalid thread',
        senderIdentifier: 'invalid_non_numeric_thread',
        recipientIdentifier: '17841400000000001',
        externalMessageId: 'm_mid_ig_invalid_thread',
        createdAt: new Date(),
      },
    });

    const res = await request(app)
      .post(`/api/v1/conversations/${invalidConv.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Hello',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('must be a numerical IGSID');

    await prisma.conversation.delete({ where: { id: invalidConv.id } });
  });
});
