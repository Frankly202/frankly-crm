import { RequestHandler } from 'express';
import { NotFoundError } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (req, _res, next): void => {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
};
