import { z } from 'zod';
import { Role } from '@prisma/client';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email('Valid email address is required')),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email('Valid email address is required')),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  name: z.string().min(2, 'Name must be at least 2 characters long').trim(),
  role: z.nativeEnum(Role).optional().default(Role.AGENT),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32, 'Valid refresh token string is required'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(32, 'Valid refresh token string is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
