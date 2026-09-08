import { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { ApiResponse } from '../../common/types/api-response.js';

interface HealthData {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
}

export const getHealth = (_req: Request, res: Response<ApiResponse<HealthData>>): void => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.NODE_ENV,
    },
  });
};
