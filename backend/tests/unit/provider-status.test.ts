import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWhatsAppConfigStatus,
  getInstagramConfigStatus,
  getResendConfigStatus,
  getProvidersHealthSummary,
} from '../../src/common/utils/provider-status.util.js';
import { env } from '../../src/config/env.js';

describe('Provider Configuration Health Diagnostics', () => {
  const originalEnv = { ...env };

  beforeEach(() => {
    // Reset to defaults
    env.WHATSAPP_PHONE_NUMBER_ID = undefined;
    env.WHATSAPP_ACCESS_TOKEN = undefined;
    env.INSTAGRAM_PAGE_ID = undefined;
    env.INSTAGRAM_ACCESS_TOKEN = undefined;
    env.RESEND_API_KEY = undefined;
    env.EMAIL_FROM_ADDRESS = undefined;
    env.PROVIDER_MODE = 'mock';
  });

  it('should detect NOT_CONFIGURED when all credentials are unset', () => {
    expect(getWhatsAppConfigStatus()).toBe('NOT_CONFIGURED');
    expect(getInstagramConfigStatus()).toBe('NOT_CONFIGURED');
    expect(getResendConfigStatus()).toBe('NOT_CONFIGURED');

    const summary = getProvidersHealthSummary();
    expect(summary.mode).toBe('mock');
    expect(summary.whatsapp).toBe('NOT_CONFIGURED');
    expect(summary.instagram).toBe('NOT_CONFIGURED');
    expect(summary.resend).toBe('NOT_CONFIGURED');
    expect(summary.metaGraphApiVersion).toBe(originalEnv.META_GRAPH_API_VERSION);
  });

  it('should detect MISCONFIGURED when only partial credentials are provided', () => {
    env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    env.WHATSAPP_ACCESS_TOKEN = undefined;
    expect(getWhatsAppConfigStatus()).toBe('MISCONFIGURED');

    env.INSTAGRAM_PAGE_ID = 'page-123';
    env.INSTAGRAM_ACCESS_TOKEN = undefined;
    expect(getInstagramConfigStatus()).toBe('MISCONFIGURED');

    env.RESEND_API_KEY = 're_test_123';
    env.EMAIL_FROM_ADDRESS = undefined;
    expect(getResendConfigStatus()).toBe('MISCONFIGURED');
  });

  it('should detect CONFIGURED when all required credentials for channel are present', () => {
    env.WHATSAPP_PHONE_NUMBER_ID = '1234567890';
    env.WHATSAPP_ACCESS_TOKEN = 'token-whatsapp-test';
    expect(getWhatsAppConfigStatus()).toBe('CONFIGURED');

    env.INSTAGRAM_ACCESS_TOKEN = 'token-instagram-test';
    expect(getInstagramConfigStatus()).toBe('CONFIGURED');

    env.RESEND_API_KEY = 're_test_123';
    env.EMAIL_FROM_ADDRESS = 'Frankly CRM <no-reply@crm.frankedu-global.com>';
    expect(getResendConfigStatus()).toBe('CONFIGURED');
  });
});
