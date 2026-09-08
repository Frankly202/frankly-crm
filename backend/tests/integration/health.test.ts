import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('GET /api/v1/health', () => {
  it('should return 200 with ok status and environment details', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: 'ok',
        environment: expect.any(String),
      },
    });
    expect(response.body.data.timestamp).toBeDefined();
    expect(typeof response.body.data.uptimeSeconds).toBe('number');
  });
});
