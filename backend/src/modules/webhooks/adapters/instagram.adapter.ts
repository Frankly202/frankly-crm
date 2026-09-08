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
import { BadGatewayError } from '../../../common/errors/app-error.js';
import { logger } from '../../../common/utils/logger.js';

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
          senderName: event.sender.username
            ? `@${event.sender.username.replace(/^@/, '')}`
            : undefined,
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
    if (env.PROVIDER_MODE === 'mock') {
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

    // Fail closed in live mode: credentials must be present
    const accessToken = env.INSTAGRAM_ACCESS_TOKEN?.trim();
    const apiVersion = env.META_GRAPH_API_VERSION?.trim() || 'v26.0';

    if (!accessToken) {
      throw new BadGatewayError(
        'Instagram Graph API is not configured or missing credentials in live mode',
      );
    }

    let recipientId = params.recipientIdentifier.trim();
    if (recipientId.startsWith('@')) {
      recipientId = recipientId.slice(1);
    }
    if (!recipientId) {
      throw new BadGatewayError('Invalid recipient identifier for Instagram message');
    }

    const url = `https://graph.facebook.com/${apiVersion}/me/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: {
            id: recipientId,
          },
          message: {
            text: params.body,
          },
        }),
      });

      const responseBody = (await response.json().catch(() => ({}))) as {
        message_id?: string;
        recipient_id?: string;
        error?: { message?: string; code?: number };
      };

      if (!response.ok || !responseBody.message_id) {
        const errorMsg =
          responseBody.error?.message || response.statusText || 'Meta Graph API error';
        const errorCode = responseBody.error?.code;
        logger.error(`Meta Instagram API delivery failed: ${errorMsg} (status ${response.status})`);
        throw new BadGatewayError(`Instagram delivery failed: ${errorMsg}`, {
          status: response.status,
          code: errorCode,
        });
      }

      return {
        success: true,
        externalMessageId: responseBody.message_id,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: recipientId,
          simulated: false,
        },
      };
    } catch (err) {
      if (err instanceof BadGatewayError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network error';
      logger.error(`Network error communicating with Instagram Graph API: ${message}`);
      throw new BadGatewayError(`Instagram API network failure: ${message}`);
    }
  }
}

export const instagramAdapter = new InstagramAdapter();
