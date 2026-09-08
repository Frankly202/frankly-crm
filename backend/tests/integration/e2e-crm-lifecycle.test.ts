import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import {
  LeadCategory,
  LeadStatus,
  ChannelType,
  MessageDirection,
  MessageStatus,
  ActivityType,
} from '@prisma/client';

describe('Phase 10 E2E CRM Customer Journey Lifecycle Suite', () => {
  let adminToken: string;
  let adminUserId: string;
  const adminEmail = process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com';
  const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!';

  const studentEmail = `e2e.student.${Date.now()}@example.com`;
  const studentPhone = `+4477${Date.now().toString().slice(-8)}`;
  let testContactId = '';
  let testLeadId = '';
  let testConversationId = '';

  beforeAll(async () => {
    await connectDatabase();

    // Authenticate as Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword });

    expect(loginRes.status).toBe(200);
    adminToken = loginRes.body.data.accessToken;
    adminUserId = loginRes.body.data.user.id;
  });

  afterAll(async () => {
    try {
      if (testContactId) {
        await prisma.message.deleteMany({ where: { conversation: { contactId: testContactId } } });
        await prisma.conversation.deleteMany({ where: { contactId: testContactId } });
        await prisma.activityLog.deleteMany({ where: { lead: { contactId: testContactId } } });
        await prisma.lead.deleteMany({ where: { contactId: testContactId } });
        await prisma.contact.deleteMany({ where: { id: testContactId } });
      }
    } catch {
      // ignore cleanup errors
    }
    await disconnectDatabase();
  });

  it('1. Inbound Website Enquiry -> Auto-creates Contact & Lead in NEW status', async () => {
    const res = await request(app)
      .post('/api/v1/webhooks/website')
      .send({
        name: 'Amara Okafor',
        email: studentEmail,
        phone: studentPhone,
        category: LeadCategory.STUDY_ABROAD_STUDENT,
        message: 'Interested in MSc Computer Science in Limassol for Fall 2026.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.processedCount).toBe(1);

    // Verify contact in PostgreSQL
    const contact = await prisma.contact.findUnique({
      where: { primaryEmail: studentEmail },
    });
    expect(contact).not.toBeNull();
    expect(contact?.name).toBe('Amara Okafor');
    testContactId = contact!.id;

    // Verify lead in PostgreSQL
    const lead = await prisma.lead.findFirst({
      where: { contactId: testContactId },
    });
    expect(lead).not.toBeNull();
    expect(lead?.status).toBe(LeadStatus.NEW);
    expect(lead?.category).toBe(LeadCategory.STUDY_ABROAD_STUDENT);
    expect(lead?.sourceChannel).toBe(ChannelType.WEBSITE_FORM);
    testLeadId = lead!.id;

    // Verify conversation created
    const conversation = await prisma.conversation.findFirst({
      where: { contactId: testContactId },
      include: { messages: true },
    });
    expect(conversation).not.toBeNull();
    expect(conversation?.messages.length).toBe(1);
    expect(conversation?.messages[0]?.direction).toBe(MessageDirection.INBOUND);
    testConversationId = conversation!.id;
  });

  it('2. Dashboard Metrics -> Reflects the newly created lead', async () => {
    const res = await request(app)
      .get('/api/v1/leads/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totals.totalLeads).toBeGreaterThanOrEqual(1);
    expect(res.body.data.byStatus.NEW).toBeGreaterThanOrEqual(1);
    expect(res.body.data.byCategory.STUDY_ABROAD_STUDENT).toBeGreaterThanOrEqual(1);
  });

  it('3. Agent Reviews Inbox -> Discovers unread thread and marks as read', async () => {
    // 3a. Discovers unread conversation
    const unreadListRes = await request(app)
      .get('/api/v1/conversations?unreadOnly=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(unreadListRes.status).toBe(200);
    const targetConv = unreadListRes.body.data.find(
      (c: { id: string }) => c.id === testConversationId,
    );
    expect(targetConv).toBeDefined();
    expect(targetConv.isUnread).toBe(true);

    // 3b. Mark conversation as read
    const markReadRes = await request(app)
      .patch(`/api/v1/conversations/${testConversationId}/read`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(markReadRes.status).toBe(200);
    expect(markReadRes.body.data.isUnread).toBe(false);

    // 3c. Verify thread no longer appears in unreadOnly list
    const updatedUnreadList = await request(app)
      .get('/api/v1/conversations?unreadOnly=true')
      .set('Authorization', `Bearer ${adminToken}`);

    const foundNow = updatedUnreadList.body.data.find(
      (c: { id: string }) => c.id === testConversationId,
    );
    expect(foundNow).toBeUndefined();
  });

  it('4. Agent Progresses Lead -> Updates status from NEW to CONTACTED', async () => {
    const res = await request(app)
      .patch(`/api/v1/leads/${testLeadId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: LeadStatus.CONTACTED,
        note: 'Initial phone consultation completed with student.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(LeadStatus.CONTACTED);

    // Verify activity log
    const activity = await prisma.activityLog.findFirst({
      where: {
        leadId: testLeadId,
        type: ActivityType.STATUS_CHANGED,
      },
    });
    expect(activity).not.toBeNull();
    expect(activity?.description).toContain('NEW to CONTACTED');
  });

  it('5. Customer Inbound Reply -> Auto-transitions Lead from CONTACTED to REPLIED', async () => {
    const externalMessageId = `wa_reply_${Date.now()}`;
    const cleanPhone = studentPhone.replace(/[^0-9]/g, '');

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'mock_waba_id',
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '35799000000', phone_number_id: 'mock_pn_id' },
                contacts: [{ profile: { name: 'Amara Okafor' }, wa_id: cleanPhone }],
                messages: [
                  {
                    from: cleanPhone,
                    id: externalMessageId,
                    timestamp: Math.floor(Date.now() / 1000).toString(),
                    type: 'text',
                    text: { body: 'Thank you! I have uploaded my academic transcripts.' },
                  },
                ],
              },
              field: 'messages',
            },
          ],
        },
      ],
    };

    const secret = process.env['META_APP_SECRET'];
    const signature = secret
      ? `sha256=${crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`
      : 'sha256=testsignature';

    const webhookRes = await request(app)
      .post('/api/v1/webhooks/whatsapp')
      .set('x-local-fixture-test', 'true')
      .set('x-hub-signature-256', signature)
      .send(payload);

    expect(webhookRes.status).toBe(200);

    // Verify lead status was automatically updated to REPLIED in DB
    const updatedLead = await prisma.lead.findUnique({
      where: { id: testLeadId },
    });
    expect(updatedLead?.status).toBe(LeadStatus.REPLIED);

    // Verify conversation is unread again due to the customer reply
    const unreadRes = await request(app)
      .get('/api/v1/conversations?unreadOnly=true')
      .set('Authorization', `Bearer ${adminToken}`);

    const returnedConv = unreadRes.body.data.find(
      (c: { contactId: string }) => c.contactId === testContactId,
    );
    expect(returnedConv).toBeDefined();
    expect(returnedConv.isUnread).toBe(true);
    testConversationId = returnedConv.id;
  });

  it('6. Agent Replies Outbound via Unified Inbox', async () => {
    const res = await request(app)
      .post(`/api/v1/conversations/${testConversationId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        body: 'Great! Your transcripts have been received and sent for university review.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.direction).toBe(MessageDirection.OUTBOUND);
    expect(res.body.data.status).toBe(MessageStatus.SENT);
  });

  it('7. Agent Assigns Lead to Themselves and Schedules Next Action', async () => {
    // 7a. Assign to self
    const assignRes = await request(app)
      .patch(`/api/v1/leads/${testLeadId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assignedToUserId: adminUserId });

    expect(assignRes.status).toBe(200);
    expect(assignRes.body.data.assignedToUserId).toBe(adminUserId);

    // 7b. Set next action with tomorrow due date
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const updateRes = await request(app)
      .patch(`/api/v1/leads/${testLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nextActionRequired: 'Issue unconditional offer letter',
        nextActionDueDate: tomorrow,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.nextActionRequired).toBe('Issue unconditional offer letter');
    expect(updateRes.body.data.nextActionDueDate).toBeDefined();
  });

  it('8. Verifies Complete Activity Log Trail across entire journey', async () => {
    const activitiesRes = await request(app)
      .get(`/api/v1/leads/${testLeadId}/activities`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(activitiesRes.status).toBe(200);
    const activities = activitiesRes.body.data as Array<{ type: ActivityType; description: string }>;

    const activityTypes = activities.map((a) => a.type);

    // All key CRM milestone activities must be present
    expect(activityTypes).toContain(ActivityType.LEAD_CREATED);
    expect(activityTypes).toContain(ActivityType.MESSAGE_RECEIVED);
    expect(activityTypes).toContain(ActivityType.STATUS_CHANGED);
    expect(activityTypes).toContain(ActivityType.MESSAGE_SENT);
    expect(activityTypes).toContain(ActivityType.LEAD_ASSIGNED);
    expect(activityTypes).toContain(ActivityType.NEXT_ACTION_SET);
  });
});
