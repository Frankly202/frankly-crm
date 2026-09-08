import { Router } from 'express';
import { contactController } from './contact.controller.js';
import { authenticate } from '../../common/middlewares/auth.middleware.js';
import { validate } from '../../common/middlewares/validate.middleware.js';
import {
  createContactSchema,
  updateContactSchema,
  contactQuerySchema,
} from './contact.schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: contactQuerySchema }), (req, res, next) =>
  contactController.listContacts(req, res, next),
);

router.post('/', validate({ body: createContactSchema }), (req, res, next) =>
  contactController.createContact(req, res, next),
);

router.get('/:id', (req, res, next) =>
  contactController.getContactById(req, res, next),
);

router.patch('/:id', validate({ body: updateContactSchema }), (req, res, next) =>
  contactController.updateContact(req, res, next),
);

export default router;
