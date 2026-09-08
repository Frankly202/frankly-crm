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
        return crypto.timingSafeEqual(
          Buffer.from(signatureHeader),
          Buffer.from(expectedSignature),
        );
      } catch {
        return false;
      }
    }

    // Fail closed in production if secret is not configured
    if (env.NODE_ENV === 'production') {
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
    // Local provider-agnostic simulator for MVP Phase 5
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
}

export const whatsAppAdapter = new WhatsAppAdapter();
