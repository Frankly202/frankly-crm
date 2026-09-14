import { Router } from 'express';
import cors from 'cors';
import { ChannelType } from '@prisma/client';
import { webhookController } from './webhook.controller.js';
import { websiteFormRateLimiter } from '../../common/middlewares/rate-limiter.middleware.js';

const router = Router();

// 1. WhatsApp Webhook Routes
router.get('/whatsapp', (req, res, next) =>
  webhookController.verifyMetaChallenge(req, res, next),
);
router.post('/whatsapp', (req, res, next) =>
  webhookController.handleInbound(req, res, next, ChannelType.WHATSAPP),
);

// 2. Instagram Webhook Routes
router.get('/instagram', (req, res, next) =>
  webhookController.verifyMetaChallenge(req, res, next),
);
router.post('/instagram', (req, res, next) =>
  webhookController.handleInbound(req, res, next, ChannelType.INSTAGRAM),
);

// 3. Facebook Page Messenger Webhook Routes (Meta Page Subscription)
router.get('/messenger', (req, res, next) =>
  webhookController.verifyMetaChallenge(req, res, next),
);
router.post('/messenger', (_req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'CHANNEL_NOT_YET_ENABLED',
      message: 'Facebook Messenger message ingestion is scheduled for Phase 4',
    },
  });
});

// 4. Resend Inbound Email Webhook
router.post('/resend', (req, res, next) =>
  webhookController.handleInbound(req, res, next, ChannelType.RESEND_EMAIL),
);

// 5. Website Enquiry Form Webhook (Public CORS enabled + Honeypot & Rate limiting)

router.post(
  '/website',
  cors(),
  websiteFormRateLimiter,
  (req, res, next) =>
    webhookController.handleInbound(req, res, next, ChannelType.WEBSITE_FORM),
);

export default router;
