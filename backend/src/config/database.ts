import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from '../common/utils/logger.js';

const prismaClientSingleton = (): PrismaClient => {
  if (env.NODE_ENV === 'test') {
    const url = (env.DATABASE_URL || '').toLowerCase();
    if (
      url.includes('supabase.co') ||
      url.includes('pooler.supabase.com') ||
      url.includes('sukcdaawcyxlquvtxdsi')
    ) {
      throw new Error(
        'FATAL_PRODUCTION_SAFETY_ERROR: Attempted to initialize PrismaClient against Supabase while NODE_ENV=test!'
      );
    }
  }

  return new PrismaClient({
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'warn' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });
};

declare global {
  var prismaGlobal: undefined | PrismaClient;
}

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    logger.info('Connected to PostgreSQL database via Prisma');
  } catch (error) {
    logger.error('Failed to connect to database', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Disconnected from database');
}
