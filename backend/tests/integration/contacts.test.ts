import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';
import { prisma, connectDatabase, disconnectDatabase } from '../../src/config/database.js';

describe('Contacts API Integration', () => {
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

  describe('GET /api/v1/contacts', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const response = await request(app).get('/api/v1/contacts');
      expect(response.status).toBe(401);
    });

    it('should list contacts with pagination and meta for authenticated user', async () => {
      const response = await request(app)
        .get('/api/v1/contacts?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({
        page: 1,
        limit: 5,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      });
    });

    it('should filter contacts by search term', async () => {
      const response = await request(app)
        .get('/api/v1/contacts?search=Andreas')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data[0].name).toContain('Andreas');
    });
  });

  describe('POST /api/v1/contacts', () => {
    const newContactEmail = 'nicos.cyprus@example.com';
    const newContactPhone = '+35799887766';
    const newContactHandle = '@nicos_cyprus';

    afterAll(async () => {
      await prisma.contact.deleteMany({
        where: {
          OR: [
            { primaryEmail: newContactEmail },
            { primaryPhone: newContactPhone },
            { instagramHandle: newContactHandle },
          ],
        },
      });
    });

    it('should successfully create a new contact', async () => {
      const response = await request(app)
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Nicos Hadjipavlou',
          primaryEmail: newContactEmail,
          primaryPhone: newContactPhone,
          instagramHandle: newContactHandle,
          metadata: { city: 'Larnaca' },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        name: 'Nicos Hadjipavlou',
        primaryEmail: newContactEmail,
        primaryPhone: newContactPhone,
        instagramHandle: newContactHandle,
      });
      expect(response.body.data.id).toBeDefined();
    });

    it('should reject contact creation with duplicate email with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Nicos Duplicate Email',
          primaryEmail: newContactEmail,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should reject contact creation with duplicate phone with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Nicos Duplicate Phone',
          primaryPhone: newContactPhone,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('phone');
    });

    it('should reject contact creation with duplicate Instagram handle with 409 Conflict', async () => {
      const response = await request(app)
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Nicos Duplicate IG',
          instagramHandle: newContactHandle,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('CONFLICT');
      expect(response.body.error.message).toContain('Instagram handle');
    });
  });

  describe('GET /api/v1/contacts/:id', () => {
    it('should return contact 360-degree view with linked leads and conversations', async () => {
      const existing = await prisma.contact.findFirst({
        where: { primaryEmail: 'andreas.p@example.com' },
      });
      expect(existing).toBeDefined();

      const response = await request(app)
        .get(`/api/v1/contacts/${existing!.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(existing!.id);
      expect(Array.isArray(response.body.data.leads)).toBe(true);
      expect(Array.isArray(response.body.data.conversations)).toBe(true);
    });

    it('should return 404 for non-existent contact ID', async () => {
      const response = await request(app)
        .get('/api/v1/contacts/00000000-0000-0000-0000-999999999999')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/contacts/:id', () => {
    let patchContactId: string;

    beforeAll(async () => {
      const contact = await prisma.contact.create({
        data: {
          name: 'Contact For Patch Testing',
          primaryEmail: 'patch.test.contact@example.com',
          primaryPhone: '+35799000111',
          instagramHandle: '@initial_patch_handle',
        },
      });
      patchContactId = contact.id;
    });

    afterAll(async () => {
      await prisma.contact.deleteMany({
        where: { id: patchContactId },
      });
    });

    it('should update contact details successfully', async () => {
      const response = await request(app)
        .patch(`/api/v1/contacts/${patchContactId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          instagramHandle: '@updated_patch_handle',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.instagramHandle).toBe('@updated_patch_handle');
    });

    it('should reject update if new email is already taken by another contact', async () => {
      const response = await request(app)
        .patch(`/api/v1/contacts/${patchContactId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primaryEmail: 'andreas.p@example.com',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should reject update if new phone is already taken by another contact', async () => {
      const response = await request(app)
        .patch(`/api/v1/contacts/${patchContactId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          primaryPhone: '+35799123456',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });

    it('should reject update if new Instagram handle is already taken by another contact', async () => {
      const response = await request(app)
        .patch(`/api/v1/contacts/${patchContactId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          instagramHandle: '@fatima_study',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CONFLICT');
    });
  });
});
