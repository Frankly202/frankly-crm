import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../../src/common/utils/logger.js';

describe('Logger utility', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should format and output info log as JSON', () => {
    logger.info('Test info message', { key: 'value' });
    expect(console.info).toHaveBeenCalledTimes(1);
    const loggedStr = vi.mocked(console.info).mock.calls[0]?.[0];
    const parsed = JSON.parse(loggedStr as string);
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Test info message');
    expect(parsed.key).toBe('value');
    expect(parsed.timestamp).toBeDefined();
  });

  it('should format and output warn log as JSON', () => {
    logger.warn('Test warn message');
    expect(console.warn).toHaveBeenCalledTimes(1);
    const loggedStr = vi.mocked(console.warn).mock.calls[0]?.[0];
    const parsed = JSON.parse(loggedStr as string);
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('Test warn message');
  });

  it('should format and output error log as JSON', () => {
    logger.error('Test error message', { errorId: 42 });
    expect(console.error).toHaveBeenCalledTimes(1);
    const loggedStr = vi.mocked(console.error).mock.calls[0]?.[0];
    const parsed = JSON.parse(loggedStr as string);
    expect(parsed.level).toBe('error');
    expect(parsed.message).toBe('Test error message');
    expect(parsed.errorId).toBe(42);
  });
});
