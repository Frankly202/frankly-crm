import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { LeadCategory, LeadStatus, ActivityType, Role } from '@prisma/client';

describe('Leads API Integration', () => {
  let adminToken: string;
  let agent1Token: string;
  let agent1Id: string;
  let agent2Id: string;
  let deactivatedUserId: string;
  let testContactId: string;

  beforeAll(async () => {
    await connectDatabase();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com',
        password: process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!',
      });
    adminToken = loginRes.body.data.accessToken;

    // Clean up test users from previous runs
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['lead.agent1@example.com', 'lead.agent2@example.com', 'lead.deactivated@example.com'],
        },
      },
    });

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const agent1 = await prisma.user.create({
      data: {
        email: 'lead.agent1@example.com',
        name: 'Lead Test Agent 1',
        passwordHash,
        role: Role.AGENT,
        isActive: true,
      },
    });
    agent1Id = agent1.id;

    const agent2 = await prisma.user.create({
      data: {
        email: 'lead.agent2@example.com',
        name: 'Lead Test Agent 2',
        passwordHash,
        role: Role.AGENT,
        isActive: true,
      },
    });
    agent2Id = agent2.id;

    const deactivatedUser = await prisma.user.create({
      data: {
        email: 'lead.deactivated@example.com',
        name: 'Deactivated Test Agent',
        passwordHash,
        role: Role.AGENT,
        isActive: false,
      },
    });
    deactivatedUserId = deactivatedUser.id;

    const agentLoginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'lead.agent1@example.com',
        password: 'TestPass123!',
      });
    agent1Token = agentLoginRes.body.data.accessToken;

    const contact = await prisma.contact.create({
      data: {
        name: 'Lead Integration Test Contact',
        primaryEmail: 'lead.test.contact@example.com',
      },
    });
    testContactId = contact.id;
  });

  afterAll(async () => {
    await prisma.lead.deleteMany({
      where: { contactId: testContactId },
    });
    await prisma.contact.deleteMany({
      where: { id: testContactId },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            'lead.agent1@example.com',
            'lead.agent2@example.com',
            'lead.deactivated@example.com',
          ],
        },
      },
    });
    await disconnectDatabase();
  });

  describe('GET /api/v1/leads', () => {
    it('should reject unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/v1/leads');
      expect(response.status).toBe(401);
    });

    it('should list leads with pagination and metadata', async () => {
      const response = await request(app)
        .get('/api/v1/leads?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('should filter leads by category', async () => {
      const response = await request(app)
        .get(`/api/v1/leads?category=${LeadCategory.PROPERTY_BUYER_INVESTOR}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      for (const lead of response.body.data) {
        expect(lead.category).toBe(LeadCategory.PROPERTY_BUYER_INVESTOR);
      }
    });

    it('should filter leads by status', async () => {
      const response = await request(app)
        .get(`/api/v1/leads?status=${LeadStatus.NEW}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      for (const lead of response.body.data) {
        expect(lead.status).toBe(LeadStatus.NEW);
      }
    });
  });

  describe('POST /api/v1/leads', () => {
    it('should create a lead under the STUDY_ABROAD_STUDENT category and automatically log LEAD_CREATED activity', async () => {
      const response = await request(app)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Undergraduate Computer Science Admission 2026',
          category: LeadCategory.STUDY_ABROAD_STUDENT,
          contactId: testContactId,
          notes: 'High school diploma with distinction.',
          nextActionRequired: 'Send European University Cyprus prospectus',
          nextActionDueDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.category).toBe(LeadCategory.STUDY_ABROAD_STUDENT);
      expect(response.body.data.status).toBe(LeadStatus.NEW);

      const createdLeadId = response.body.data.id;

      // Verify activity log was automatically created
      const activities = await prisma.activityLog.findMany({
        where: { leadId: createdLeadId },
      });
      const createActivity = activities.find((a) => a.type === ActivityType.LEAD_CREATED);
      expect(createActivity).toBeDefined();

      const nextActionActivity = activities.find((a) => a.type === ActivityType.NEXT_ACTION_SET);
      expect(nextActionActivity).toBeDefined();
    });
  });

  describe('Lead Workflow Transitions & Activities', () => {
    let leadId: string;

    beforeAll(async () => {
      const lead = await prisma.lead.create({
        data: {
          title: 'Commercial Office Space Acquisition',
          category: LeadCategory.PROPERTY_BUYER_INVESTOR,
          status: LeadStatus.NEW,
          contactId: testContactId,
        },
      });
      leadId = lead.id;
    });

    it('should update lead status and record STATUS_CHANGED activity log', async () => {
      const response = await request(app)
        .patch(`/api/v1/leads/${leadId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: LeadStatus.CONTACTED,
          note: 'Called client to discuss office space square meters in Nicosia',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe(LeadStatus.CONTACTED);

      // Verify activity log entry
      const activities = await prisma.activityLog.findMany({
        where: { leadId, type: ActivityType.STATUS_CHANGED },
      });
      expect(activities.length).toBeGreaterThanOrEqual(1);
      const latest = activities[activities.length - 1];
      expect(latest?.description).toContain('NEW to CONTACTED');
    });

    it('should update next action and record NEXT_ACTION_SET activity log', async () => {
      const dueDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

      const response = await request(app)
        .patch(`/api/v1/leads/${leadId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nextActionRequired: 'Send commercial leasing contract',
          nextActionDueDate: dueDate,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.nextActionRequired).toBe('Send commercial leasing contract');

      const activities = await prisma.activityLog.findMany({
        where: { leadId, type: ActivityType.NEXT_ACTION_SET },
      });
      expect(activities.length).toBeGreaterThanOrEqual(1);
    });

    it('should add manual note activity via POST /api/v1/leads/:id/activities', async () => {
      const response = await request(app)
        .post(`/api/v1/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: ActivityType.NOTE_ADDED,
          description: 'Client visited Frankly office in Limassol for in-person briefing.',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.description).toContain('Limassol');
    });

    it('should fetch complete activity timeline via GET /api/v1/leads/:id/activities', async () => {
      const response = await request(app)
        .get(`/api/v1/leads/${leadId}/activities`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(3);
    });

    it('should assign lead via PATCH /api/v1/leads/:id/assign and record LEAD_ASSIGNED', async () => {
      const adminUser = await prisma.user.findUnique({
        where: { email: 'emmanuel@frankedu-global.com' },
      });
      expect(adminUser).toBeDefined();

      const response = await request(app)
        .patch(`/api/v1/leads/${leadId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignedToUserId: adminUser!.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.assignedToUserId).toBe(adminUser!.id);

      const activities = await prisma.activityLog.findMany({
        where: { leadId, type: ActivityType.LEAD_ASSIGNED },
      });
      expect(activities.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject reverting an in-progress lead back to NEW status with 400 Bad Request', async () => {
      // Lead is currently CONTACTED
      const response = await request(app)
        .patch(`/api/v1/leads/${leadId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: LeadStatus.NEW,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toContain('Cannot revert');
    });

    it('should reject assigning lead to a deactivated user account with 400 Bad Request', async () => {
      const response = await request(app)
        .patch(`/api/v1/leads/${leadId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignedToUserId: deactivatedUserId,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BAD_REQUEST');
      expect(response.body.error.message).toContain('deactivated');
    });

    it('should enforce role-based authorization for lead assignments', async () => {
      // Create an unassigned test lead
      const unassignedLead = await prisma.lead.create({
        data: {
          title: 'Unassigned Test Lead for Authorization',
          category: LeadCategory.OTHER_BUSINESS,
          status: LeadStatus.NEW,
          contactId: testContactId,
        },
      });

      // 1. Agent should be allowed to self-assign unassigned lead
      const selfAssignRes = await request(app)
        .patch(`/api/v1/leads/${unassignedLead.id}/assign`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({
          assignedToUserId: agent1Id,
        });

      expect(selfAssignRes.status).toBe(200);
      expect(selfAssignRes.body.data.assignedToUserId).toBe(agent1Id);

      // 2. Agent should NOT be allowed to assign a lead to another agent (agent2)
      const reassignOtherRes = await request(app)
        .patch(`/api/v1/leads/${unassignedLead.id}/assign`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({
          assignedToUserId: agent2Id,
        });

      expect(reassignOtherRes.status).toBe(403);
      expect(reassignOtherRes.body.error.code).toBe('FORBIDDEN');

      // 3. Agent should NOT be allowed to unassign a lead
      const unassignAgentRes = await request(app)
        .patch(`/api/v1/leads/${unassignedLead.id}/assign`)
        .set('Authorization', `Bearer ${agent1Token}`)
        .send({
          assignedToUserId: null,
        });

      expect(unassignAgentRes.status).toBe(403);
      expect(unassignAgentRes.body.error.code).toBe('FORBIDDEN');

      // 4. Admin CAN reassign to agent 2
      const adminReassignRes = await request(app)
        .patch(`/api/v1/leads/${unassignedLead.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignedToUserId: agent2Id,
        });

      expect(adminReassignRes.status).toBe(200);
      expect(adminReassignRes.body.data.assignedToUserId).toBe(agent2Id);

      // 5. Admin CAN unassign lead
      const adminUnassignRes = await request(app)
        .patch(`/api/v1/leads/${unassignedLead.id}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assignedToUserId: null,
        });

      expect(adminUnassignRes.status).toBe(200);
      expect(adminUnassignRes.body.data.assignedToUserId).toBeNull();
    });
  });
});
