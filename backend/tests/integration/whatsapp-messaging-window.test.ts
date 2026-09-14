import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { conversationService } from '../../src/modules/conversations/conversation.service.js';
import { ChannelType, MessageDirection, MessageStatus, LeadCategory } from '@prisma/client';
import { signAccessToken } from '../../src/common/utils/token.util.js';

describe('WhatsApp 24-Hour Customer Service Window Integration Tests', () => {
  const testPhone = '+35799773311';
  let adminToken: string;
  let testContactId: string;
  let testLeadId: string;

  const cleanupDatabase = async () => {
    await prisma.message.deleteMany({
      where: {
        OR: [
          { senderIdentifier: testPhone },
          { recipientIdentifier: testPhone },
        ],
      },
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

    const contact = await prisma.contact.create({
      data: {
        name: 'Andreas Kyriakou',
        primaryPhone: testPhone,
      },
    });
    testContactId = contact.id;

    const lead = await prisma.lead.create({
      data: {
        title: 'WhatsApp Student Inquiry: Andreas Kyriakou',
        category: LeadCategory.STUDY_ABROAD_STUDENT,
        contactId: contact.id,
      },
    });
    testLeadId = lead.id;
  });

  it('should allow outbound replies when customer messaged within 24 hours', async () => {
    // 1. Create WhatsApp conversation
    const conversation = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.WHATSAPP,
        channelThreadId: testPhone,
        lastMessageAt: new Date(),
      },
    });

    // 2. Insert customer inbound message sent 2 hours ago
    const twoHoursAgoSeconds = Math.floor((Date.now() - 2 * 3600 * 1000) / 1000);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Can I apply for the Spring semester?',
        senderIdentifier: testPhone,
        recipientIdentifier: '+35799000000',
        externalMessageId: `wamid.RECENT_${Date.now()}`,
        rawPayload: {
          id: `wamid.RECENT_${Date.now()}`,
          timestamp: String(twoHoursAgoSeconds),
          from: testPhone.replace('+', ''),
          type: 'text',
        },
        createdAt: new Date(twoHoursAgoSeconds * 1000),
      },
    });

    // 3. Verify getConversationById returns messagingWindow.isOpen = true
    const convDetail = await conversationService.getConversationById(conversation.id);
    expect(convDetail.messagingWindow).toBeDefined();
    expect(convDetail.messagingWindow?.isOpen).toBe(true);
    expect(convDetail.messagingWindow?.expiresAt).toBeDefined();

    // 4. Send outbound message via API
    const res = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Yes Andreas, Spring semester applications are currently open!',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.direction).toBe(MessageDirection.OUTBOUND);
    expect(res.body.data.status).toBe(MessageStatus.SENT);
  });

  it('should reject outbound replies with 422 WHATSAPP_WINDOW_EXPIRED when customer message is >24 hours old', async () => {
    const conversation = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.WHATSAPP,
        channelThreadId: testPhone,
        lastMessageAt: new Date(Date.now() - 26 * 3600 * 1000),
      },
    });

    // Inbound message provider timestamp 26 hours ago
    const twentySixHoursAgoSeconds = Math.floor((Date.now() - 26 * 3600 * 1000) / 1000);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Inquiry from yesterday',
        senderIdentifier: testPhone,
        recipientIdentifier: '+35799000000',
        externalMessageId: `wamid.OLD_${Date.now()}`,
        rawPayload: {
          id: `wamid.OLD_${Date.now()}`,
          timestamp: String(twentySixHoursAgoSeconds),
          from: testPhone.replace('+', ''),
          type: 'text',
        },
        createdAt: new Date(twentySixHoursAgoSeconds * 1000),
      },
    });

    // Verify getConversationById returns messagingWindow.isOpen = false
    const convDetail = await conversationService.getConversationById(conversation.id);
    expect(convDetail.messagingWindow).toBeDefined();
    expect(convDetail.messagingWindow?.isOpen).toBe(false);

    // Attempting to send reply must fail with 422 WHATSAPP_WINDOW_EXPIRED
    const res = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Late reply after 26 hours',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('WHATSAPP_WINDOW_EXPIRED');
    expect(res.body.error.message).toContain('Customer service window expired (>24h)');
  });

  it('should reject outbound replies with 422 WHATSAPP_WINDOW_EXPIRED when no customer inbound message exists', async () => {
    // Thread created manually without any inbound customer message
    const conversation = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.WHATSAPP,
        channelThreadId: testPhone,
        lastMessageAt: new Date(),
      },
    });

    const convDetail = await conversationService.getConversationById(conversation.id);
    expect(convDetail.messagingWindow?.isOpen).toBe(false);
    expect(convDetail.messagingWindow?.expiresAt).toBeNull();

    const res = await request(app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Cold outbound without customer inbound message',
      });

    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('WHATSAPP_WINDOW_EXPIRED');
  });

  it('should not extend the 24-hour window from outbound messages or status events', async () => {
    const conversation = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: ChannelType.WHATSAPP,
        channelThreadId: testPhone,
        lastMessageAt: new Date(),
      },
    });

    // Customer inbound message 25 hours ago
    const twentyFiveHoursAgo = Math.floor((Date.now() - 25 * 3600 * 1000) / 1000);
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        body: 'Old message',
        senderIdentifier: testPhone,
        recipientIdentifier: '+35799000000',
        externalMessageId: `wamid.EXPIRED_${Date.now()}`,
        rawPayload: { timestamp: String(twentyFiveHoursAgo) },
        createdAt: new Date(twentyFiveHoursAgo * 1000),
      },
    });

    // An outbound message was sent 10 minutes ago
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.DELIVERED,
        body: 'Previous agent reply',
        senderIdentifier: 'FranklyEdu CRM',
        recipientIdentifier: testPhone,
        externalMessageId: `wa_out_recent_${Date.now()}`,
        createdAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });

    // Even though there is an outbound message 10 mins ago, window is calculated on customer inbound
    const convDetail = await conversationService.getConversationById(conversation.id);
    expect(convDetail.messagingWindow?.isOpen).toBe(false);

    // Outbound reply should still be blocked
    await expect(
      conversationService.sendOutboundMessage(conversation.id, {
        body: 'Follow up',
      }),
    ).rejects.toThrow('Customer service window expired (>24h)');
  });
});
