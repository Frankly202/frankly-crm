import { describe, it, expect } from 'vitest';
import { loginSchema, registerSchema, refreshTokenSchema } from '../../src/modules/auth/auth.schemas.js';
import { Role } from '@prisma/client';

describe('Auth Validation Schemas', () => {
  describe('loginSchema', () => {
    it('should validate and normalize valid login payload', () => {
      const input = {
        email: '  Frankly@Frankedu-Global.com  ',
        password: 'Password123!',
      };
      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('frankly@frankedu-global.com');
      }
    });

    it('should reject invalid email and short password', () => {
      const input = {
        email: 'not-an-email',
        password: 'short',
      };
      const result = loginSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBe(2);
      }
    });
  });

  describe('registerSchema', () => {
    it('should parse valid registration and apply default role', () => {
      const input = {
        email: 'agent@frankedu-global.com',
        password: 'AgentPassword2026!',
        name: 'Agent Smith',
      };
      const result = registerSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe(Role.AGENT);
      }
    });
  });

  describe('refreshTokenSchema', () => {
    it('should accept 32+ character refresh token string', () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: 'abcdef1234567890abcdef1234567890abcdef12',
      });
      expect(result.success).toBe(true);
    });

    it('should reject too short refresh token', () => {
      const result = refreshTokenSchema.safeParse({
        refreshToken: 'too_short',
      });
      expect(result.success).toBe(false);
    });
  });
});
