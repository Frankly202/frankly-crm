import { Request, Response, NextFunction } from 'express';
import { conversationService } from './conversation.service.js';
import { ApiResponse } from '../../common/types/api-response.js';
import { ConversationQueryInput } from './conversation.schemas.js';

export class ConversationController {
  async listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { conversations, meta } = await conversationService.listConversations(
        req.query as unknown as ConversationQueryInput,
      );
      const response: ApiResponse = {
        success: true,
        data: conversations,
        meta,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async getConversationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const conversation = await conversationService.getConversationById(
        req.params['id'] as string,
      );
      const response: ApiResponse = {
        success: true,
        data: conversation,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async sendOutboundMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const message = await conversationService.sendOutboundMessage(
        req.params['id'] as string,
        req.body,
        req.user,
      );
      const response: ApiResponse = {
        success: true,
        data: message,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  async markConversationAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await conversationService.markConversationAsRead(
        req.params['id'] as string,
      );
      const response: ApiResponse = {
        success: true,
        data: result,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const conversationController = new ConversationController();
