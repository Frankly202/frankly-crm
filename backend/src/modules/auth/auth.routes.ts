import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { requireRole } from '../../common/middlewares/role.middleware.js';
import { authRateLimiter } from '../../common/middlewares/rate-limiter.middleware.js';
import { Role } from '@prisma/client';
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  logoutSchema,
} from './auth.schemas.js';

const router = Router();

router.post('/login', authRateLimiter, validate({ body: loginSchema }), (req, res, next) =>
  authController.login(req, res, next),
);

// User creation is strictly restricted to authenticated ADMIN users
router.post(
  '/register',
  authenticate,
  requireRole(Role.ADMIN),
  validate({ body: registerSchema }),
  (req, res, next) => authController.register(req, res, next),
);

router.post('/refresh', validate({ body: refreshTokenSchema }), (req, res, next) =>
  authController.refresh(req, res, next),
);

router.post('/logout', validate({ body: logoutSchema }), (req, res, next) =>
  authController.logout(req, res, next),
);

router.get('/me', authenticate, (req, res, next) =>
  authController.me(req, res, next),
);

export default router;
