import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { LeadCategory, LeadStatus } from '@prisma/client';

describe('Dashboard Metrics API Integration', () => {
  let adminToken: string;

  beforeAll(async () => {
    await connectDatabase();

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com',
        password: process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!',
      });
    adminToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  it('should reject unauthenticated request with 401', async () => {
    const response = await request(app).get('/api/v1/leads/dashboard/metrics');
    expect(response.status).toBe(401);
  });

  it('should return aggregated metrics derived from existing CRM data', async () => {
    const response = await request(app)
      .get('/api/v1/leads/dashboard/metrics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const metrics = response.body.data;

    // 1. Totals
    expect(metrics.totals).toBeDefined();
    expect(typeof metrics.totals.totalLeads).toBe('number');
    expect(typeof metrics.totals.totalContacts).toBe('number');
    expect(metrics.totals.totalLeads).toBeGreaterThanOrEqual(1);

    // 2. By Status
    expect(metrics.byStatus).toBeDefined();
    for (const status of Object.values(LeadStatus)) {
      expect(typeof metrics.byStatus[status]).toBe('number');
    }

    // 3. By Category (5 approved business sectors)
    expect(metrics.byCategory).toBeDefined();
    for (const category of Object.values(LeadCategory)) {
      expect(typeof metrics.byCategory[category]).toBe('number');
    }

    // 4. Next Actions
    expect(metrics.nextActions).toMatchObject({
      totalPending: expect.any(Number),
      overdue: expect.any(Number),
      dueToday: expect.any(Number),
      upcoming: expect.any(Number),
      noDueDate: expect.any(Number),
    });
    expect(metrics.nextActions.totalPending).toBe(
      metrics.nextActions.overdue +
        metrics.nextActions.dueToday +
        metrics.nextActions.upcoming +
        metrics.nextActions.noDueDate,
    );

    // 5. Recent Activity
    expect(metrics.recentActivity).toMatchObject({
      leadsCreatedToday: expect.any(Number),
      leadsCreatedThisWeek: expect.any(Number),
    });
  });
});
