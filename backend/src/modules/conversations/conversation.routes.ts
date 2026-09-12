import { Router } from 'express';
import { conversationController } from './conversation.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { outboundEmailRateLimiter } from '../../common/middlewares/rate-limiter.middleware.js';
import {
  conversationQuerySchema,
  unreadCountQuerySchema,
  sendOutboundMessageSchema,
  startEmailConversationSchema,
} from './conversation.schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: conversationQuerySchema }), (req, res, next) =>
  conversationController.listConversations(req, res, next),
);

router.get('/unread-count', validate({ query: unreadCountQuerySchema }), (req, res, next) =>
  conversationController.getUnreadCount(req, res, next),
);

router.post(
  '/start-email',
  outboundEmailRateLimiter,
  validate({ body: startEmailConversationSchema }),
  (req, res, next) => conversationController.startEmailConversation(req, res, next),
);

router.get('/:id', (req, res, next) =>
  conversationController.getConversationById(req, res, next),
);

router.post(
  '/:id/messages',
  validate({ body: sendOutboundMessageSchema }),
  (req, res, next) => conversationController.sendOutboundMessage(req, res, next),
);

router.patch('/:id/read', (req, res, next) =>
  conversationController.markConversationAsRead(req, res, next),
);

export default router;
