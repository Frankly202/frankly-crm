import { describe, it, expect } from 'vitest';
import {
  parseEnv,
  KNOWN_DEFAULT_JWT_SECRET,
  KNOWN_DEFAULT_ADMIN_PASSWORDS,
} from '../../src/config/env.js';
import { ZodError } from 'zod';

describe('Production Environment Secrets Guardrail (Phase 10)', () => {
  const baseValidProdEnv = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://prod_user:secret@postgres.internal:5432/frankly_prod',
    CORS_ORIGIN: 'https://crm.frankedu-global.com',
    INITIAL_ADMIN_EMAIL: 'emmanuel@frankedu-global.com',
    INITIAL_ADMIN_PASSWORD: 'SuperSecureProdPassword2026!',
    JWT_SECRET: 'super_secure_production_jwt_secret_key_minimum_32_chars_2026_verified',
  };

  it('should accept valid, explicit production secrets', () => {
    const parsed = parseEnv(baseValidProdEnv);
    expect(parsed.NODE_ENV).toBe('production');
    expect(parsed.JWT_SECRET).toBe(baseValidProdEnv.JWT_SECRET);
    expect(parsed.INITIAL_ADMIN_PASSWORD).toBe(baseValidProdEnv.INITIAL_ADMIN_PASSWORD);
  });

  it('should reject production configuration when JWT_SECRET uses known development default', () => {
    expect(() =>
      parseEnv({
        ...baseValidProdEnv,
        JWT_SECRET: KNOWN_DEFAULT_JWT_SECRET,
      }),
    ).toThrow(ZodError);

    try {
      parseEnv({
        ...baseValidProdEnv,
        JWT_SECRET: KNOWN_DEFAULT_JWT_SECRET,
      });
    } catch (err) {
      const issues = (err as ZodError).issues;
      expect(issues.some((i) => i.path.includes('JWT_SECRET'))).toBe(true);
    }
  });

  it('should reject production configuration when JWT_SECRET is omitted', () => {
    const envWithoutJwt = { ...baseValidProdEnv } as Record<string, unknown>;
    delete envWithoutJwt['JWT_SECRET'];
    expect(() => parseEnv(envWithoutJwt)).toThrow(ZodError);
  });

  it('should reject production configuration when INITIAL_ADMIN_PASSWORD uses known development default', () => {
    for (const defaultPassword of KNOWN_DEFAULT_ADMIN_PASSWORDS) {
      expect(() =>
        parseEnv({
          ...baseValidProdEnv,
          INITIAL_ADMIN_PASSWORD: defaultPassword,
        }),
      ).toThrow(ZodError);
    }
  });

  it('should reject production configuration when INITIAL_ADMIN_PASSWORD is omitted', () => {
    const envWithoutPassword = { ...baseValidProdEnv } as Record<string, unknown>;
    delete envWithoutPassword['INITIAL_ADMIN_PASSWORD'];
    expect(() => parseEnv(envWithoutPassword)).toThrow(ZodError);
  });

  it('should allow development and test environments to boot with convenient defaults', () => {
    const devParsed = parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://frankly_user:frankly_pass@localhost:5435/frankly_crm',
    });
    expect(devParsed.NODE_ENV).toBe('development');
    expect(devParsed.JWT_SECRET).toBe(KNOWN_DEFAULT_JWT_SECRET);
    expect(devParsed.INITIAL_ADMIN_PASSWORD).toBe(KNOWN_DEFAULT_ADMIN_PASSWORDS[0]);

    const testParsed = parseEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://frankly_user:frankly_pass@localhost:5435/frankly_crm',
    });
    expect(testParsed.NODE_ENV).toBe('test');
    expect(testParsed.JWT_SECRET).toBe(KNOWN_DEFAULT_JWT_SECRET);
  });
});
