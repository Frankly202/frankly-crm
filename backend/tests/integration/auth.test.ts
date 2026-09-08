import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';
import { Role } from '@prisma/client';

describe('Authentication API Integration', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await disconnectDatabase();
  });

  const adminEmail = process.env['INITIAL_ADMIN_EMAIL'] ?? 'emmanuel@frankedu-global.com';
  const adminPassword = process.env['INITIAL_ADMIN_PASSWORD'] ?? 'FranklyAdmin2026!';

  describe('POST /api/v1/auth/login', () => {
    it('should successfully log in with seeded admin credentials and return tokens', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toMatchObject({
        email: adminEmail,
        role: Role.ADMIN,
        name: 'Emmanuel Frankly',
      });
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(typeof response.body.data.accessToken).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });

    it('should reject login with wrong password without revealing details', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: 'IncorrectPassword999!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent email with the same generic error', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown.user@example.com',
          password: 'SomePassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(response.body.error.message).toBe('Invalid email or password');
    });

    it('should reject malformed input with 422 validation error', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'invalid-email',
          password: '123',
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user profile when valid access token is provided', async () => {
      // 1. Login first
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      const token = loginRes.body.data.accessToken;

      // 2. Call /me
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data).toMatchObject({
        email: adminEmail,
        role: Role.ADMIN,
      });
      expect(meRes.body.data.passwordHash).toBeUndefined();
    });

    it('should return 401 when Authorization header is missing', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when token is invalid or expired', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid.access.token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/refresh & Rotation Lifecycle', () => {
    it('should rotate refresh token and return new token pair', async () => {
      // 1. Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      const initialRefreshToken = loginRes.body.data.refreshToken;

      // 2. Refresh
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(typeof refreshRes.body.data.accessToken).toBe('string');
      expect(typeof refreshRes.body.data.refreshToken).toBe('string');
      expect(refreshRes.body.data.refreshToken).not.toBe(initialRefreshToken);

      // 3. Verify the old refresh token cannot be reused
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initialRefreshToken });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.error.message).toContain('revoked');
    });

    it('should safely handle concurrent refresh requests so only one succeeds and race condition is prevented', async () => {
      // 1. Login
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      const tokenToRotate = loginRes.body.data.refreshToken;

      // 2. Fire two concurrent refresh requests simultaneously with the exact same token
      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokenToRotate }),
        request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokenToRotate }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactly one must be 200 (success) and the other must be 401 (unauthorized)
      expect(statuses).toEqual([200, 401]);

      const successfulRes = res1.status === 200 ? res1 : res2;
      const failedRes = res1.status === 401 ? res1 : res2;

      expect(successfulRes.body.success).toBe(true);
      expect(typeof successfulRes.body.data.accessToken).toBe('string');
      expect(failedRes.body.success).toBe(false);
      expect(failedRes.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should revoke refresh token upon logout', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
        });

      const refreshToken = loginRes.body.data.refreshToken;

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Try refreshing with the logged-out token
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(401);
    });

    it('should have rate limiting active with standard headers on POST /api/v1/auth/refresh', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'non_existent_token_string' });

      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/register (ADMIN Guarded)', () => {
    const testAgentEmail = 'new.agent@frankedu-global.com';
    let adminToken: string;

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: adminEmail,
          password: adminPassword,
        });
      adminToken = loginRes.body.data.accessToken;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({
        where: { email: testAgentEmail },
      });
    });

    it('should reject unauthenticated caller with 401 Unauthorized', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: testAgentEmail,
          password: 'AgentPassword2026!',
          name: 'Sarah Agent',
          role: Role.ADMIN, // Attempt self-assigning ADMIN without auth
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow authenticated ADMIN to create a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: testAgentEmail,
          password: 'AgentPassword2026!',
          name: 'Sarah Agent',
          role: Role.AGENT,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        email: testAgentEmail,
        role: Role.AGENT,
        name: 'Sarah Agent',
      });
      expect(response.body.data.passwordHash).toBeUndefined();
    });

    it('should reject creation if email is already in use with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: adminEmail,
          password: 'AnotherPassword2026!',
          name: 'Imposter',
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should reject user creation when called by an AGENT with 403 Forbidden', async () => {
      // 1. Login as the newly created AGENT
      const agentLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testAgentEmail,
          password: 'AgentPassword2026!',
        });

      const agentToken = agentLoginRes.body.data.accessToken;

      // 2. Attempt to create another user using AGENT token
      const response = await request(app)
        .post('/api/v1/auth/register')
        .set('Authorization', `Bearer ${agentToken}`)
        .send({
          email: 'escalation.attempt@frankedu-global.com',
          password: 'EscalationPassword2026!',
          name: 'Privilege Escalation Attempt',
          role: Role.ADMIN,
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });
});
