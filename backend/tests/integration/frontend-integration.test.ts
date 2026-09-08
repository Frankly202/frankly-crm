import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import {
  Role,
  LeadCategory,
  LeadStatus,
  ChannelType,
  MessageDirection,
  MessageStatus,
  ActivityType,
} from '@prisma/client';

describe('Phase 8 Frontend & Backend Full Integration Suite', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  let accessToken = '';
  let refreshToken = '';
  let testLeadId = '';
  let testContactId = '';
  let testConversationId = '';
  const testPhone = `+4479${Date.now().toString().slice(-8)}`;
  const adminEmail = process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com';
  const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!';
  const FRONTEND_ORIGIN = 'http://localhost:8080';

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
      // teardown error ignored
    }
    await disconnectDatabase();
  });

  describe('1. CORS Validation', () => {
    it('should set Access-Control-Allow-Origin for frontend origin http://localhost:8080', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', FRONTEND_ORIGIN);

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(FRONTEND_ORIGIN);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should set Access-Control-Allow-Origin for secondary dev origin http://localhost:3000', async () => {
      const res = await request(app)
        .get('/api/v1/health')
        .set('Origin', 'http://localhost:3000');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });
  });

  describe('2. Authentication & Session Restore', () => {
    it('should authenticate seeded admin user and return token pair', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', FRONTEND_ORIGIN)
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(adminEmail);
      expect(res.body.data.user.role).toBe(Role.ADMIN);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should restore session via GET /auth/me with Bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(adminEmail);
    });

    it('should reject unauthenticated access with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Origin', FRONTEND_ORIGIN);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('3. Dashboard Metrics Integration', () => {
    it('should return real PostgreSQL dashboard metrics via /leads/dashboard/metrics', async () => {
      const res = await request(app)
        .get('/api/v1/leads/dashboard/metrics')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.totals.totalLeads).toBe('number');
      expect(res.body.data.byStatus).toBeDefined();
      expect(res.body.data.byCategory).toBeDefined();
    });
  });

  describe('4. Leads Management Integration', () => {
    it('should create a lead referencing a contact and persist to PostgreSQL', async () => {
      // 1. Create a contact first
      const contact = await prisma.contact.create({
        data: {
          name: 'Phase 8 Test Contact',
          primaryEmail: `phase8-test-${Date.now()}@example.com`,
          primaryPhone: testPhone,
        },
      });
      testContactId = contact.id;

      // 2. Create lead via API
      const res = await request(app)
        .post('/api/v1/leads')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          title: 'Study Abroad Fall 2026',
          category: LeadCategory.STUDY_ABROAD_STUDENT,
          contactId: testContactId,
          sourceChannel: ChannelType.WHATSAPP,
          notes: 'Phase 8 integration test lead notes',
          nextActionRequired: 'Send course list',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Study Abroad Fall 2026');
      expect(res.body.data.category).toBe(LeadCategory.STUDY_ABROAD_STUDENT);
      expect(res.body.data.status).toBe(LeadStatus.NEW);

      testLeadId = res.body.data.id;

      // Direct Prisma verification
      const dbLead = await prisma.lead.findUnique({ where: { id: testLeadId } });
      expect(dbLead).not.toBeNull();
      expect(dbLead?.title).toBe('Study Abroad Fall 2026');
    });

    it('should list leads with pagination metadata', async () => {
      const res = await request(app)
        .get('/api/v1/leads?page=1&limit=10')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.page).toBe(1);
    });

    it('should update lead status and record STATUS_CHANGED activity log in PostgreSQL', async () => {
      const res = await request(app)
        .patch(`/api/v1/leads/${testLeadId}/status`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: LeadStatus.CONTACTED,
          note: 'Initial consultation completed',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(LeadStatus.CONTACTED);

      // Verify activity log exists in PostgreSQL
      const activity = await prisma.activityLog.findFirst({
        where: {
          leadId: testLeadId,
          type: ActivityType.STATUS_CHANGED,
        },
      });
      expect(activity).not.toBeNull();
      expect(activity?.description).toContain('NEW to CONTACTED');
    });
  });

  describe('5. Contacts Integration', () => {
    it('should fetch paginated contacts list', async () => {
      const res = await request(app)
        .get('/api/v1/contacts?limit=10')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should fetch contact detail with associated leads and conversations', async () => {
      const res = await request(app)
        .get(`/api/v1/contacts/${testContactId}`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(testContactId);
      expect(res.body.data.primaryPhone).toBe(testPhone);
      expect(Array.isArray(res.body.data.leads)).toBe(true);
    });
  });

  describe('6. Unified Inbox & Messaging Integration', () => {
    it('should list conversations and manage outbound messaging and read status', async () => {
      // 1. Create a conversation for the test contact in PostgreSQL
      const conv = await prisma.conversation.create({
        data: {
          contactId: testContactId,
          leadId: testLeadId,
          channel: ChannelType.WHATSAPP,
          channelThreadId: testPhone,
          lastMessageAt: new Date(),
          lastReadAt: null,
        },
      });
      testConversationId = conv.id;

      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: MessageDirection.INBOUND,
          status: MessageStatus.RECEIVED,
          body: 'Hello, need help with UK Visa',
          senderIdentifier: testPhone,
          recipientIdentifier: '+35799000000',
        },
      });

      // 2. Fetch conversations
      const listRes = await request(app)
        .get('/api/v1/conversations')
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.success).toBe(true);
      const foundConv = listRes.body.data.find((c: { id: string }) => c.id === testConversationId);
      expect(foundConv).toBeDefined();
      expect(foundConv.isUnread).toBe(true);

      // 3. Send outbound message
      const sendRes = await request(app)
        .post(`/api/v1/conversations/${testConversationId}/messages`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          body: 'Hello! An advisor has been assigned to your case.',
        });

      expect(sendRes.status).toBe(201);
      expect(sendRes.body.success).toBe(true);
      expect(sendRes.body.data.direction).toBe(MessageDirection.OUTBOUND);
      expect(sendRes.body.data.body).toBe('Hello! An advisor has been assigned to your case.');

      // 4. Mark conversation as read
      const markReadRes = await request(app)
        .patch(`/api/v1/conversations/${testConversationId}/read`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(markReadRes.status).toBe(200);
      expect(markReadRes.body.success).toBe(true);
      expect(markReadRes.body.data.isUnread).toBe(false);

      // Verify in PostgreSQL
      const dbConv = await prisma.conversation.findUnique({ where: { id: testConversationId } });
      expect(dbConv?.lastReadAt).not.toBeNull();
    });
  });

  describe('7. Token Refresh Rotation & Security Contract', () => {
    it('should rotate refresh token and return new token pair', async () => {
      const oldToken = refreshToken;

      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Origin', FRONTEND_ORIGIN)
        .send({ refreshToken: oldToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.accessToken).toBe('string');
      expect(typeof res.body.data.refreshToken).toBe('string');
      expect(res.body.data.refreshToken).not.toBe(oldToken);

      // Save new rotated tokens
      refreshToken = res.body.data.refreshToken;
      accessToken = res.body.data.accessToken;
    });

    it('should detect reuse of the old refresh token and reject with 401 UNAUTHORIZED', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: adminPassword });
      const originalRefreshToken = loginRes.body.data.refreshToken;

      // First use -> succeeds and rotates
      const firstRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken });
      expect(firstRefresh.status).toBe(200);

      // Second use of same original token -> REUSE DETECTED, fails with 401
      const reuseAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken });
      expect(reuseAttempt.status).toBe(401);
      expect(reuseAttempt.body.success).toBe(false);
      expect(reuseAttempt.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should safely handle concurrent refresh requests (single flight resilience)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: adminPassword });
      const targetToken = loginRes.body.data.refreshToken;

      // Simulate 2 simultaneous requests with same token at the server level
      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: targetToken }),
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: targetToken }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must succeed (200) and the other must be rejected (401)
      expect(statuses).toEqual([200, 401]);
    });
  });
});
