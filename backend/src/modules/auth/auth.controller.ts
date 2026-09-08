import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { ApiResponse } from '../../common/types/api-response.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const session = await authService.login(req.body);
      const response: ApiResponse = {
        success: true,
        data: session,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.register(req.body);
      const response: ApiResponse = {
        success: true,
        data: user,
      };
      res.status(201).json(response);
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokens = await authService.refreshTokens(req.body.refreshToken);
      const response: ApiResponse = {
        success: true,
        data: tokens,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await authService.logout(req.body.refreshToken);
      const response: ApiResponse = {
        success: true,
        data: { message: 'Logged out successfully' },
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Not authenticated');
      }
      const user = await authService.getCurrentUser(req.user.id);
      const response: ApiResponse = {
        success: true,
        data: user,
      };
      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
