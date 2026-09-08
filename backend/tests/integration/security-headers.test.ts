import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('Security Headers and CORS', () => {
  it('should include helmet security headers', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.headers['x-dns-prefetch-control']).toBe('off');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-download-options']).toBe('noopen');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should include proper CORS headers on preflight for port 3000', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('should include proper CORS headers on preflight for port 8080', async () => {
    const response = await request(app)
      .options('/api/v1/health')
      .set('Origin', 'http://localhost:8080')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:8080');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
