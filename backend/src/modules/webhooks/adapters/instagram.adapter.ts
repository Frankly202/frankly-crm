import crypto from 'crypto';
import { Request } from 'express';
import { ChannelType } from '@prisma/client';
import {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageParams,
  OutboundDeliveryResult,
} from './channel-adapter.interface.js';
import { normalizeInstagramHandle } from '../../../common/utils/identifier.util.js';
import { env } from '../../../config/env.js';

interface MetaInstagramPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: {
        id?: string;
        username?: string;
      };
      recipient?: {
        id?: string;
      };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
      };
    }>;
  }>;
}

export class InstagramAdapter implements ChannelAdapter {
  readonly channel = ChannelType.INSTAGRAM;

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
    const data = payload as MetaInstagramPayload;
    const messages: NormalizedInboundMessage[] = [];

    if (!data.entry || !Array.isArray(data.entry)) {
      return messages;
    }

    for (const entry of data.entry) {
      for (const event of entry.messaging || []) {
        if (!event.message?.mid || !event.sender?.id) {
          continue;
        }

        const rawHandle = event.sender.username || event.sender.id;
        const senderIdentifier = normalizeInstagramHandle(rawHandle);
        const recipientIdentifier = event.recipient?.id || 'FranklyEdu Instagram';
        const body = event.message.text || '[Attachment / Media]';
        const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();

        messages.push({
          channel: ChannelType.INSTAGRAM,
          externalMessageId: event.message.mid,
          senderIdentifier,
          senderName: event.sender.username ? `@${event.sender.username.replace(/^@/, '')}` : undefined,
          recipientIdentifier,
          body,
          rawPayload: event as unknown as Record<string, unknown>,
          timestamp,
        });
      }
    }

    return messages;
  }

  async sendOutboundMessage(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
    const externalMessageId = `ig_out_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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

export const instagramAdapter = new InstagramAdapter();
