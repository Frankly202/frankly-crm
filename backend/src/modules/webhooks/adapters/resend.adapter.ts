import crypto from 'crypto';
import { Request } from 'express';
import { ChannelType } from '@prisma/client';
import {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageParams,
  OutboundDeliveryResult,
} from './channel-adapter.interface.js';
import { normalizeEmail } from '../../../common/utils/identifier.util.js';
import { env } from '../../../config/env.js';

interface ResendEmailPayload {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    subject?: string;
    text?: string;
    html?: string;
  };
}

export class ResendEmailAdapter implements ChannelAdapter {
  readonly channel = ChannelType.RESEND_EMAIL;

  verifyWebhookSignature(req: Request): boolean {
    const secret = process.env['RESEND_WEBHOOK_SECRET'] || env.RESEND_WEBHOOK_SECRET;

    if (secret) {
      const svixId = req.headers['svix-id'] as string | undefined;
      const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
      const svixSignature = req.headers['svix-signature'] as string | undefined;

      if (!svixId || !svixTimestamp || !svixSignature) {
        return false;
      }

      const rawBody = req.rawBody;
      if (!rawBody) {
        return false;
      }

      // Format secret (strip whsec_ if present)
      const cleanSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
      const keyBuffer = Buffer.from(cleanSecret, 'base64');

      const toSign = `${svixId}.${svixTimestamp}.${rawBody.toString('utf-8')}`;
      const expectedSignature = crypto
        .createHmac('sha256', keyBuffer.length > 0 ? keyBuffer : secret)
        .update(toSign)
        .digest('base64');

      // svix-signature can contain multiple space-delimited signatures like "v1,sig1 v1,sig2"
      const passedSignatures = svixSignature
        .split(' ')
        .map((part) => (part.startsWith('v1,') ? part.slice(3) : part));

      const matched = passedSignatures.some((sig) => {
        try {
          return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSignature));
        } catch {
          return false;
        }
      });

      return matched;
    }

    // Fail closed in production if secret is not configured
    if (env.NODE_ENV === 'production') {
      return false;
    }

    // In local non-production, explicitly allow only designated fixture test requests
    return req.headers['x-local-fixture-test'] === 'true';
  }

  normalizeInboundPayload(payload: unknown): NormalizedInboundMessage[] {
    const data = payload as ResendEmailPayload;
    if (!data.data || !data.data.email_id || !data.data.from) {
      return [];
    }

    const senderIdentifier = normalizeEmail(data.data.from);
    let senderName: string | undefined;

    const angleMatch = /^(.*?)\s*<.*?>$/.exec(data.data.from.trim());
    if (angleMatch && angleMatch[1]) {
      senderName = angleMatch[1].replace(/["']/g, '').trim() || undefined;
    }

    const recipientIdentifier =
      data.data.to && data.data.to.length > 0
        ? normalizeEmail(data.data.to[0] || '')
        : 'emmanuel@frankedu-global.com';

    let body = data.data.text || '';
    if (!body && data.data.html) {
      // Strip HTML tags for clean text view
      body = data.data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (!body && data.data.subject) {
      body = `[Subject: ${data.data.subject}]`;
    }

    const timestamp = data.created_at ? new Date(data.created_at) : new Date();

    return [
      {
        channel: ChannelType.RESEND_EMAIL,
        externalMessageId: data.data.email_id,
        senderIdentifier,
        senderName,
        recipientIdentifier,
        body,
        rawPayload: data as unknown as Record<string, unknown>,
        timestamp,
      },
    ];
  }

  async sendOutboundMessage(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
    const externalMessageId = `resend_out_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
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

export const resendEmailAdapter = new ResendEmailAdapter();
