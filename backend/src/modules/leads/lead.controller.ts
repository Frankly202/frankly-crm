import { Request, Response, NextFunction } from 'express';
import { leadService } from './lead.service.js';
import { ApiResponse } from '../../common/types/api-response.js';
import { LeadQueryInput } from './lead.schemas.js';

export class LeadController {
  async listLeads(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { leads, meta } = await leadService.listLeads(
        req.query as unknown as LeadQueryInput,
      );
      const response: ApiResponse = {
        success: true,
        data: leads,
        meta,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async getLeadById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lead = await leadService.getLeadById(req.params['id'] as string);
      const response: ApiResponse = {
        success: true,
        data: lead,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async createLead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lead = await leadService.createLead(req.body, req.user);
      const response: ApiResponse = {
        success: true,
        data: lead,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  async updateLead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lead = await leadService.updateLead(
        req.params['id'] as string,
        req.body,
        req.user,
      );
      const response: ApiResponse = {
        success: true,
        data: lead,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async updateLeadStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lead = await leadService.updateLeadStatus(
        req.params['id'] as string,
        req.body,
        req.user,
      );
      const response: ApiResponse = {
        success: true,
        data: lead,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async assignLead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const lead = await leadService.assignLead(
        req.params['id'] as string,
        req.body,
        req.user,
      );
      const response: ApiResponse = {
        success: true,
        data: lead,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async addActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activity = await leadService.addActivity(
        req.params['id'] as string,
        req.body,
        req.user?.id,
      );
      const response: ApiResponse = {
        success: true,
        data: activity,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  async getLeadActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const activities = await leadService.getLeadActivities(req.params['id'] as string);
      const response: ApiResponse = {
        success: true,
        data: activities,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async getDashboardMetrics(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const metrics = await leadService.getDashboardMetrics();
      const response: ApiResponse = {
        success: true,
        data: metrics,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const leadController = new LeadController();
