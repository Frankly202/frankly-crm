import crypto from 'crypto';
import { Request } from 'express';
import { ChannelType } from '@prisma/client';
import {
  ChannelAdapter,
  NormalizedInboundMessage,
  NormalizedStatusUpdate,
  OutboundMessageParams,
  OutboundDeliveryResult,
} from './channel-adapter.interface.js';
import { normalizePhone } from '../../../common/utils/identifier.util.js';
import { env } from '../../../config/env.js';
import {
  AppError,
  BadRequestError,
  BadGatewayError,
  UnprocessableEntityError,
} from '../../../common/errors/app-error.js';
import { logger } from '../../../common/utils/logger.js';
import { verifyMetaSignature } from '../utils/meta-signature.util.js';

export interface MetaGraphErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_data?: {
      messaging_product?: string;
      details?: string;
    };
    fbtrace_id?: string;
  };
}

function getEnvValue(key: keyof typeof env): string | undefined {
  const envVal = env[key];
  if (typeof envVal === 'string' && envVal.trim().length > 0) {
    return envVal.trim();
  }
  const processVal = process.env[key];
  if (typeof processVal === 'string' && processVal.trim().length > 0) {
    return processVal.trim();
  }
  return undefined;
}

function isLiveMode(): boolean {
  return env.PROVIDER_MODE === 'live' || process.env['PROVIDER_MODE'] === 'live';
}

/**
 * Centralized mapping of Meta Graph API v26.0+ error codes & subcodes to Frankly CRM errors.
 */
export function parseMetaGraphError(
  status: number,
  responseBody: MetaGraphErrorResponse,
  fallbackMessage = 'Meta Graph API error',
): AppError {
  const err = responseBody.error;
  const message = err?.error_data?.details || err?.message || fallbackMessage;
  const code = err?.code;
  const subcode = err?.error_subcode;

  // 131047 or subcode 2494010: 24-hour customer service window expired
  if (code === 131047 || subcode === 2494010) {
    return new UnprocessableEntityError(
      'Customer service window expired (>24h). WhatsApp requires an approved template message to contact or re-engage customers.',
      'WHATSAPP_WINDOW_EXPIRED',
      { code, subcode, details: message },
    );
  }

  // 131026: Recipient not on WhatsApp / undeliverable
  if (code === 131026) {
    return new UnprocessableEntityError(
      'Recipient phone number is not registered on WhatsApp or message is undeliverable.',
      'WHATSAPP_RECIPIENT_NOT_ON_WHATSAPP',
      { code, subcode, details: message },
    );
  }

  // 130429 or 80007: Cloud API throughput or account rate limit hit
  if (code === 130429 || code === 80007 || status === 429) {
    return new AppError(
      'WhatsApp Cloud API rate limit reached. Please wait a moment before retrying.',
      429,
      'WHATSAPP_RATE_LIMIT_EXCEEDED',
      { code, subcode, details: message },
    );
  }

  // 190: Invalid or expired access token
  if (code === 190 || status === 401) {
    return new BadGatewayError(
      'Meta system user access token is invalid or expired. Please check WhatsApp credentials.',
      { code, subcode, status },
    );
  }

  // 131042: Business payment account issue
  if (code === 131042) {
    return new BadGatewayError(
      'WhatsApp Business Account payment method or credit line issue.',
      { code, subcode, details: message },
    );
  }

  // 100: Invalid parameter / bad request
  if (code === 100 || status === 400) {
    return new BadRequestError(`WhatsApp delivery failed: ${message}`, {
      code,
      subcode,
    });
  }

  return new BadGatewayError(`WhatsApp delivery failed: ${message}`, {
    status,
    code,
    subcode,
  });
}

interface MetaWhatsAppPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: {
            name?: string;
          };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: {
            body?: string;
          };
          image?: {
            caption?: string;
            mime_type?: string;
            sha256?: string;
            id?: string;
          };
          video?: {
            caption?: string;
            mime_type?: string;
            sha256?: string;
            id?: string;
          };
          document?: {
            caption?: string;
            filename?: string;
            mime_type?: string;
            sha256?: string;
            id?: string;
          };
          audio?: {
            mime_type?: string;
            sha256?: string;
            id?: string;
            voice?: boolean;
          };
          location?: {
            latitude?: number;
            longitude?: number;
            name?: string;
            address?: string;
          };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          conversation?: Record<string, unknown>;
          pricing?: Record<string, unknown>;
          errors?: Array<{
            code?: number;
            title?: string;
            message?: string;
            error_data?: {
              details?: string;
            };
          }>;
        }>;
      };
      field?: string;
    }>;
  }>;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = ChannelType.WHATSAPP;

  verifyWebhookSignature(req: Request): boolean {
    return verifyMetaSignature(req);
  }

  normalizeStatusUpdates(payload: unknown): NormalizedStatusUpdate[] {
    const updates: NormalizedStatusUpdate[] = [];

    if (!payload || typeof payload !== 'object') {
      return updates;
    }

    const data = payload as MetaWhatsAppPayload;
    if (!data.entry || !Array.isArray(data.entry)) {
      return updates;
    }

    const configuredWabaId = getEnvValue('WHATSAPP_BUSINESS_ACCOUNT_ID');
    const configuredPhoneId = getEnvValue('WHATSAPP_PHONE_NUMBER_ID');

    for (const entry of data.entry) {
      if (configuredWabaId && entry.id && entry.id !== configuredWabaId) {
        logger.info(`Skipping WhatsApp status entry for foreign WABA ID: ${entry.id}`);
        continue;
      }

      for (const change of entry.changes || []) {
        const val = change.value;
        if (!val || !val.statuses || !Array.isArray(val.statuses)) {
          continue;
        }

        const phoneId = val.metadata?.phone_number_id;
        if (configuredPhoneId && phoneId && phoneId !== configuredPhoneId) {
          logger.info(`Skipping WhatsApp status change for foreign phone_number_id: ${phoneId}`);
          continue;
        }

        for (const statusItem of val.statuses) {
          if (!statusItem.id || !statusItem.status) {
            continue;
          }

          const rawStatus = statusItem.status.toLowerCase();
          let status: 'SENT' | 'DELIVERED' | 'FAILED';

          if (rawStatus === 'sent') {
            status = 'SENT';
          } else if (rawStatus === 'delivered' || rawStatus === 'read') {
            status = 'DELIVERED';
          } else if (rawStatus === 'failed') {
            status = 'FAILED';
          } else {
            continue;
          }

          const timestamp = statusItem.timestamp
            ? new Date(parseInt(statusItem.timestamp, 10) * 1000)
            : new Date();

          let errorDetails: NormalizedStatusUpdate['errorDetails'] | undefined;
          if (statusItem.errors && statusItem.errors.length > 0) {
            const firstErr = statusItem.errors[0];
            errorDetails = {
              code: firstErr?.code,
              title: firstErr?.title,
              message: firstErr?.message || firstErr?.error_data?.details,
              details: firstErr,
            };
          }

          updates.push({
            channel: ChannelType.WHATSAPP,
            externalMessageId: statusItem.id,
            status,
            rawStatus,
            timestamp,
            recipientIdentifier: statusItem.recipient_id
              ? normalizePhone(statusItem.recipient_id)
              : undefined,
            rawPayload: statusItem as unknown as Record<string, unknown>,
            errorDetails,
          });
        }
      }
    }

    return updates;
  }

  normalizeInboundPayload(payload: unknown): NormalizedInboundMessage[] {
    const messages: NormalizedInboundMessage[] = [];

    if (!payload || typeof payload !== 'object') {
      return messages;
    }

    const data = payload as MetaWhatsAppPayload;
    if (!data.entry || !Array.isArray(data.entry)) {
      return messages;
    }

    const configuredWabaId = getEnvValue('WHATSAPP_BUSINESS_ACCOUNT_ID');
    const configuredPhoneId = getEnvValue('WHATSAPP_PHONE_NUMBER_ID');

    for (const entry of data.entry) {
      if (configuredWabaId && entry.id && entry.id !== configuredWabaId) {
        logger.info(`Skipping WhatsApp inbound entry for foreign WABA ID: ${entry.id}`);
        continue;
      }

      for (const change of entry.changes || []) {
        const val = change.value;
        if (!val || !val.messages || !Array.isArray(val.messages)) {
          continue;
        }

        const phoneId = val.metadata?.phone_number_id;
        if (configuredPhoneId && phoneId && phoneId !== configuredPhoneId) {
          logger.info(`Skipping WhatsApp inbound change for foreign phone_number_id: ${phoneId}`);
          continue;
        }

        const recipientPhone = val.metadata?.display_phone_number || 'FranklyEdu WhatsApp';

        for (const msg of val.messages) {
          if (!msg.id || !msg.from) {
            continue;
          }

          const senderPhone = normalizePhone(msg.from);
          const contactProfile = val.contacts?.find((c) => c.wa_id === msg.from);
          const senderName = contactProfile?.profile?.name || undefined;

          let body = '';
          if (msg.type === 'text' && msg.text?.body) {
            body = msg.text.body;
          } else if (msg.type === 'image') {
            const caption = msg.image?.caption?.trim();
            body = caption ? `[Image] ${caption}` : '[Image]';
          } else if (msg.type === 'video') {
            const caption = msg.video?.caption?.trim();
            body = caption ? `[Video] ${caption}` : '[Video]';
          } else if (msg.type === 'document') {
            const filename = msg.document?.filename?.trim();
            const caption = msg.document?.caption?.trim();
            const prefix = filename ? `[Document: ${filename}]` : '[Document]';
            body = caption ? `${prefix} ${caption}` : prefix;
          } else if (msg.type === 'audio') {
            body = '[Audio message]';
          } else if (msg.type === 'location') {
            const locDesc = [msg.location?.name, msg.location?.address]
              .filter(Boolean)
              .join(' - ');
            body = locDesc ? `[Location: ${locDesc}]` : '[Location]';
          } else {
            body = `[Unsupported message type: ${msg.type || 'media'}]`;
          }

          const timestamp = msg.timestamp
            ? new Date(parseInt(msg.timestamp, 10) * 1000)
            : new Date();

          messages.push({
            channel: ChannelType.WHATSAPP,
            externalMessageId: msg.id,
            senderIdentifier: senderPhone,
            senderName,
            recipientIdentifier: recipientPhone,
            body,
            rawPayload: msg as unknown as Record<string, unknown>,
            timestamp,
          });
        }
      }
    }

    return messages;
  }

  async sendOutboundMessage(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
    if (!isLiveMode()) {
      const externalMessageId = `wa_out_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      return {
        success: true,
        externalMessageId,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: params.recipientIdentifier,
          simulated: true,
        },
      };
    }

    // Fail closed in live mode: credentials must be present
    const phoneNumberId = getEnvValue('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = getEnvValue('WHATSAPP_ACCESS_TOKEN');
    const apiVersion = getEnvValue('META_GRAPH_API_VERSION') || 'v26.0';

    if (!phoneNumberId || !accessToken) {
      throw new BadGatewayError(
        'WhatsApp Cloud API is not configured or missing credentials in live mode',
      );
    }

    // Clean recipient phone (E.164 without leading plus)
    const recipientPhone = params.recipientIdentifier.replace(/[^0-9]/g, '');
    if (!recipientPhone) {
      throw new BadGatewayError('Invalid recipient phone number for WhatsApp message');
    }

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientPhone,
          type: 'text',
          text: {
            preview_url: false,
            body: params.body,
          },
        }),
      });

      const responseBody = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id: string }>;
        error?: MetaGraphErrorResponse['error'];
      };

      if (!response.ok || !responseBody.messages?.[0]?.id) {
        const error = parseMetaGraphError(response.status, responseBody, response.statusText);
        logger.error(`Meta WhatsApp API delivery failed: ${error.message} (status ${response.status})`);
        throw error;
      }

      return {
        success: true,
        externalMessageId: responseBody.messages[0].id,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: recipientPhone,
          simulated: false,
        },
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network error';
      logger.error(`Network error communicating with WhatsApp Cloud API: ${message}`);
      throw new BadGatewayError(`WhatsApp API network failure: ${message}`);
    }
  }
}

export const whatsAppAdapter = new WhatsAppAdapter();
