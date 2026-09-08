type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  const payload: LogPayload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  return JSON.stringify(payload);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(formatLog('error', message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env['NODE_ENV'] !== 'production') {
      console.info(formatLog('debug', message, meta));
    }
  },
};
