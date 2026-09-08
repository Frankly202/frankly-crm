import { Router } from 'express';
import { leadController } from './lead.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import {
  createLeadSchema,
  updateLeadSchema,
  updateLeadStatusSchema,
  assignLeadSchema,
  createActivitySchema,
  leadQuerySchema,
} from './lead.schemas.js';

const router = Router();

router.use(authenticate);

// Dashboard metrics endpoint
router.get('/dashboard/metrics', (req, res, next) =>
  leadController.getDashboardMetrics(req, res, next),
);

// Lead CRUD and filtering
router.get('/', validate({ query: leadQuerySchema }), (req, res, next) =>
  leadController.listLeads(req, res, next),
);

router.post('/', validate({ body: createLeadSchema }), (req, res, next) =>
  leadController.createLead(req, res, next),
);

router.get('/:id', (req, res, next) =>
  leadController.getLeadById(req, res, next),
);

router.patch('/:id', validate({ body: updateLeadSchema }), (req, res, next) =>
  leadController.updateLead(req, res, next),
);

router.patch('/:id/status', validate({ body: updateLeadStatusSchema }), (req, res, next) =>
  leadController.updateLeadStatus(req, res, next),
);

router.patch('/:id/assign', validate({ body: assignLeadSchema }), (req, res, next) =>
  leadController.assignLead(req, res, next),
);

router.get('/:id/activities', (req, res, next) =>
  leadController.getLeadActivities(req, res, next),
);

router.post('/:id/activities', validate({ body: createActivitySchema }), (req, res, next) =>
  leadController.addActivity(req, res, next),
);

export default router;
