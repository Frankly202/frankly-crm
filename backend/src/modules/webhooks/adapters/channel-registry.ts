import { ChannelType } from '@prisma/client';
import { ChannelAdapter } from './channel-adapter.interface.js';
import { whatsAppAdapter } from './whatsapp.adapter.js';
import { instagramAdapter } from './instagram.adapter.js';
import { resendEmailAdapter } from './resend.adapter.js';
import { websiteFormAdapter } from './website.adapter.js';

const adapters: Record<ChannelType, ChannelAdapter> = {
  [ChannelType.WHATSAPP]: whatsAppAdapter,
  [ChannelType.INSTAGRAM]: instagramAdapter,
  [ChannelType.RESEND_EMAIL]: resendEmailAdapter,
  [ChannelType.WEBSITE_FORM]: websiteFormAdapter,
};

export function getChannelAdapter(channel: ChannelType): ChannelAdapter {
  const adapter = adapters[channel];
  if (!adapter) {
    throw new Error(`Unsupported channel adapter for ${channel}`);
  }
  return adapter;
}
