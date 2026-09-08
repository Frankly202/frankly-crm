import { describe, it, expect } from 'vitest';
import {
  AppError,
  NotFoundError,
  BadRequestError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
} from '../../src/common/errors/app-error.js';

describe('AppError Hierarchy', () => {
  it('should instantiate base AppError with correct defaults', () => {
    const error = new AppError('Custom error message');
    expect(error.message).toBe('Custom error message');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.isOperational).toBe(true);
    expect(error.details).toBeUndefined();
  });

  it('should instantiate NotFoundError with 404 status', () => {
    const error = new NotFoundError('User not found', { userId: '123' });
    expect(error.message).toBe('User not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.details).toEqual({ userId: '123' });
  });

  it('should instantiate BadRequestError with 400 status', () => {
    const error = new BadRequestError('Invalid input');
    expect(error.message).toBe('Invalid input');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('should instantiate ValidationError with 422 status', () => {
    const error = new ValidationError('Field validation failed', ['email is invalid']);
    expect(error.message).toBe('Field validation failed');
    expect(error.statusCode).toBe(422);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details).toEqual(['email is invalid']);
  });

  it('should instantiate UnauthorizedError with 401 status', () => {
    const error = new UnauthorizedError();
    expect(error.message).toBe('Unauthorized');
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should instantiate ForbiddenError with 403 status', () => {
    const error = new ForbiddenError();
    expect(error.message).toBe('Forbidden');
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('should instantiate ConflictError with 409 status', () => {
    const error = new ConflictError('Email already exists');
    expect(error.message).toBe('Email already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });
});
