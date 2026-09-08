import { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { logger } from '../utils/logger.js';
import { ApiErrorResponse } from '../types/api-response.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next): void => {
  if (err instanceof AppError && err.isOperational) {
    const errorBody: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    };

    res.status(err.statusCode).json(errorBody);
    return;
  }

  // Unhandled / system errors
  logger.error('Unhandled system exception', {
    name: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });

  const internalErrorBody: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred',
    },
  };

  res.status(500).json(internalErrorBody);
};
