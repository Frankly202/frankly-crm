import { describe, it, expect, vi } from 'vitest';
import { requireRole } from '../../src/common/middlewares/role.middleware.js';
import { Role } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/app-error.js';
import { Request, Response } from 'express';

describe('requireRole middleware', () => {
  it('should call next() when user has required role', () => {
    const middleware = requireRole(Role.ADMIN);
    const req = {
      user: {
        id: '1',
        email: 'admin@example.com',
        name: 'Admin',
        role: Role.ADMIN,
      },
    } as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('should call next with ForbiddenError when user has insufficient role', () => {
    const middleware = requireRole(Role.ADMIN);
    const req = {
      user: {
        id: '2',
        email: 'agent@example.com',
        name: 'Agent',
        role: Role.AGENT,
      },
    } as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(error.statusCode).toBe(403);
  });

  it('should call next with UnauthorizedError when user is not attached to request', () => {
    const middleware = requireRole(Role.ADMIN);
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(UnauthorizedError);
    expect(error.statusCode).toBe(401);
  });
});
