import crypto from 'crypto';
import { Request } from 'express';
import { ChannelType } from '@prisma/client';
import {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageParams,
  OutboundDeliveryResult,
} from './channel-adapter.interface.js';
import { normalizePhone } from '../../../common/utils/identifier.util.js';
import { env } from '../../../config/env.js';
import { BadGatewayError } from '../../../common/errors/app-error.js';
import { logger } from '../../../common/utils/logger.js';

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
          text?: {
            body?: string;
          };
          type?: string;
        }>;
      };
      field?: string;
    }>;
  }>;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly channel = ChannelType.WHATSAPP;

  verifyWebhookSignature(req: Request): boolean {
    const secret = process.env['META_APP_SECRET'] || env.META_APP_SECRET;

    if (secret) {
      const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
      if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
        return false;
      }

      const rawBody = req.rawBody;
      if (!rawBody) {
        return false;
      }

      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex')}`;

      try {
        const sigBuffer = Buffer.from(signatureHeader);
        const expectedBuffer = Buffer.from(expectedSignature);
        if (sigBuffer.length !== expectedBuffer.length) {
          return false;
        }
        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
      } catch {
        return false;
      }
    }

    // Fail closed in production or when live mode is active if secret is not configured
    if (env.NODE_ENV === 'production' || env.PROVIDER_MODE === 'live') {
      return false;
    }

    // In local non-production, explicitly allow only designated fixture test requests
    return req.headers['x-local-fixture-test'] === 'true';
  }

  normalizeInboundPayload(payload: unknown): NormalizedInboundMessage[] {
    const data = payload as MetaWhatsAppPayload;
    const messages: NormalizedInboundMessage[] = [];

    if (!data.entry || !Array.isArray(data.entry)) {
      return messages;
    }

    for (const entry of data.entry) {
      for (const change of entry.changes || []) {
        const val = change.value;
        if (!val || !val.messages || !Array.isArray(val.messages)) {
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
    if (env.PROVIDER_MODE === 'mock') {
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
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
    const apiVersion = env.META_GRAPH_API_VERSION?.trim() || 'v26.0';

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
        error?: { message?: string; code?: number; error_subcode?: number };
      };

      if (!response.ok || !responseBody.messages?.[0]?.id) {
        const errorMsg =
          responseBody.error?.message || response.statusText || 'Meta Graph API error';
        const errorCode = responseBody.error?.code;
        logger.error(`Meta WhatsApp API delivery failed: ${errorMsg} (status ${response.status})`);
        throw new BadGatewayError(`WhatsApp delivery failed: ${errorMsg}`, {
          status: response.status,
          code: errorCode,
        });
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
      if (err instanceof BadGatewayError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network error';
      logger.error(`Network error communicating with WhatsApp Cloud API: ${message}`);
      throw new BadGatewayError(`WhatsApp API network failure: ${message}`);
    }
  }
}

export const whatsAppAdapter = new WhatsAppAdapter();
