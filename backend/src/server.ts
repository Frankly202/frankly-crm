import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './common/utils/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Frankly CRM Backend running on port ${env.PORT}`, {
    port: env.PORT,
    environment: env.NODE_ENV,
  });
});

// Graceful shutdown handling
function gracefulShutdown(signal: string): void {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed successfully');
    process.exit(0);
  });

  // Force close after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception', { message: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  process.exit(1);
});
