import { env } from '../../config/env.js';

export type ProviderConfigState = 'NOT_CONFIGURED' | 'CONFIGURED' | 'MISCONFIGURED';

export interface ProvidersHealthSummary {
  mode: 'mock' | 'live';
  metaGraphApiVersion: string;
  whatsapp: ProviderConfigState;
  instagram: ProviderConfigState;
  resend: ProviderConfigState;
}

export function getWhatsAppConfigStatus(): ProviderConfigState {
  const hasPhone = Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_PHONE_NUMBER_ID.trim());
  const hasToken = Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_ACCESS_TOKEN.trim());

  if (!hasPhone && !hasToken) {
    return 'NOT_CONFIGURED';
  }
  if (hasPhone && hasToken) {
    return 'CONFIGURED';
  }
  return 'MISCONFIGURED';
}

export function getInstagramConfigStatus(): ProviderConfigState {
  const hasToken = Boolean(env.INSTAGRAM_ACCESS_TOKEN && env.INSTAGRAM_ACCESS_TOKEN.trim());
  const hasPage = Boolean(env.INSTAGRAM_PAGE_ID && env.INSTAGRAM_PAGE_ID.trim());

  if (!hasToken && !hasPage) {
    return 'NOT_CONFIGURED';
  }
  if (hasToken) {
    return 'CONFIGURED';
  }
  return 'MISCONFIGURED';
}

export function getResendConfigStatus(): ProviderConfigState {
  const hasKey = Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim());
  const hasFrom = Boolean(env.EMAIL_FROM_ADDRESS && env.EMAIL_FROM_ADDRESS.trim());

  if (!hasKey && !hasFrom) {
    return 'NOT_CONFIGURED';
  }
  if (hasKey && hasFrom) {
    return 'CONFIGURED';
  }
  return 'MISCONFIGURED';
}

export function getProvidersHealthSummary(): ProvidersHealthSummary {
  return {
    mode: env.PROVIDER_MODE,
    metaGraphApiVersion: env.META_GRAPH_API_VERSION,
    whatsapp: getWhatsAppConfigStatus(),
    instagram: getInstagramConfigStatus(),
    resend: getResendConfigStatus(),
  };
}
