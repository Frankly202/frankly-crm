import { Request, Response, NextFunction } from 'express';
import { contactService } from './contact.service.js';
import { ApiResponse } from '../../common/types/api-response.js';
import { ContactQueryInput } from './contact.schemas.js';

export class ContactController {
  async listContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contacts, meta } = await contactService.listContacts(
        req.query as unknown as ContactQueryInput,
      );
      const response: ApiResponse = {
        success: true,
        data: contacts,
        meta,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async getContactById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await contactService.getContactById(req.params['id'] as string);
      const response: ApiResponse = {
        success: true,
        data: contact,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async createContact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await contactService.createContact(req.body);
      const response: ApiResponse = {
        success: true,
        data: contact,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  async updateContact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const contact = await contactService.updateContact(req.params['id'] as string, req.body);
      const response: ApiResponse = {
        success: true,
        data: contact,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const contactController = new ContactController();
