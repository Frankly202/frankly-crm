import express, { Express, Request } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import healthRouter from './modules/health/health.routes.js';
import authRouter from './modules/auth/auth.routes.js';
import contactRouter from './modules/contacts/contact.routes.js';
import leadRouter from './modules/leads/lead.routes.js';
import webhookRouter from './modules/webhooks/webhook.routes.js';
import conversationRouter from './modules/conversations/conversation.routes.js';
import { notFoundHandler } from './common/middlewares/not-found.middleware.js';
import { errorHandler } from './common/middlewares/error-handler.middleware.js';

export function createApp(): Express {
  const app = express();

  // Security Middleware
  app.use(helmet());
  const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    }),
  );

  // Body Parsing Middleware
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // API Routes
  app.use('/api/v1', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/contacts', contactRouter);
  app.use('/api/v1/leads', leadRouter);
  app.use('/api/v1/webhooks', webhookRouter);
  app.use('/api/v1/conversations', conversationRouter);

  // 404 & Global Error Handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
