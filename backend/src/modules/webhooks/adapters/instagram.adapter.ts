import crypto from 'crypto';
import { Request } from 'express';
import { ChannelType } from '@prisma/client';
import {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageParams,
  OutboundDeliveryResult,
} from './channel-adapter.interface.js';
import { env, Env } from '../../../config/env.js';
import {
  AppError,
  BadGatewayError,
  BadRequestError,
  UnprocessableEntityError,
} from '../../../common/errors/app-error.js';
import { logger } from '../../../common/utils/logger.js';
import { verifyMetaSignature } from '../utils/meta-signature.util.js';

function getEnvValue(key: keyof Env | string): string | undefined {
  const envVal = (env as unknown as Record<string, unknown>)[key];
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

export interface MetaInstagramGraphErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    error_data?: {
      details?: string;
    };
  };
}

/**
 * Centralized mapping of Meta Graph API v26.0+ error codes & subcodes for Instagram Direct.
 */
export function parseInstagramGraphError(
  status: number,
  responseBody: MetaInstagramGraphErrorResponse,
  fallbackMessage = 'Meta Graph API error',
): AppError {
  const err = responseBody.error;
  const message = err?.error_data?.details || err?.message || fallbackMessage;
  const code = err?.code;
  const subcode = err?.error_subcode;

  // 10 or subcode 2534037: Outside 24h / message tag issue
  if (code === 10 || subcode === 2534037) {
    return new UnprocessableEntityError(
      'Customer service window expired or unsupported message tag. Instagram requires an active window or approved Human Agent tag to contact users.',
      'INSTAGRAM_WINDOW_EXPIRED',
      { code, subcode, details: message },
    );
  }

  // 190 or 401: Invalid or expired access token
  if (code === 190 || status === 401) {
    return new BadGatewayError(
      'Meta Page Access Token is invalid or expired. Please check Instagram credentials in Render.',
      { code, subcode, status },
    );
  }

  // 429: Rate limit
  if (code === 429 || status === 429) {
    return new AppError(
      'Instagram Graph API rate limit reached. Please wait a moment before retrying.',
      429,
      'INSTAGRAM_RATE_LIMIT_EXCEEDED',
      { code, subcode, details: message },
    );
  }

  // 100 or 400: Invalid parameter / permission
  if (code === 100 || status === 400) {
    if (subcode === 33) {
      return new BadGatewayError(
        'Meta Page Access Token does not have permission to access this Instagram account or feature.',
        { code, subcode, details: message },
      );
    }
    return new BadRequestError(`Instagram delivery failed: ${message}`, {
      code,
      subcode,
    });
  }

  return new BadGatewayError(`Instagram delivery failed: ${message}`, {
    status,
    code,
    subcode,
  });
}

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
    return verifyMetaSignature(req);
  }

  normalizeInboundPayload(payload: unknown): NormalizedInboundMessage[] {
    const data = payload as MetaInstagramPayload;
    const messages: NormalizedInboundMessage[] = [];

    if (!data.entry || !Array.isArray(data.entry)) {
      return messages;
    }

    const configuredAccountId = getEnvValue('INSTAGRAM_BUSINESS_ACCOUNT_ID');

    for (const entry of data.entry) {
      if (configuredAccountId && entry.id && entry.id !== configuredAccountId) {
        logger.info(`Skipping Instagram message entry for foreign account ID: ${entry.id}`);
        continue;
      }

      for (const event of entry.messaging || []) {
        if (!event.message?.mid || !event.sender?.id) {
          continue;
        }

        // Direction explicit:
        // Inbound sender = customer numeric IGSID
        const senderIdentifier = event.sender.id.trim();

        // Inbound recipient = Frankly Instagram account ID
        const recipientIdentifier =
          event.recipient?.id?.trim() ||
          entry.id?.trim() ||
          configuredAccountId ||
          'FranklyEdu Instagram';

        // Sender display name: @username if present, fallback to "Instagram User (last 4 digits)"
        const senderName = event.sender.username
          ? `@${event.sender.username.replace(/^@/, '')}`
          : `Instagram User (${senderIdentifier.slice(-4)})`;

        const body = event.message.text || '[Attachment / Media]';
        const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();

        messages.push({
          channel: ChannelType.INSTAGRAM,
          externalMessageId: event.message.mid,
          senderIdentifier,
          senderName,
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
    const isHumanAgent = params.metadata?.['isHumanAgentWindow'] === true;

    // Validate recipient ID: must be purely numeric IGSID
    const recipientId = params.recipientIdentifier.trim();
    if (!recipientId || !/^\d+$/.test(recipientId)) {
      throw new BadRequestError(
        'Invalid recipient identifier for Instagram message: must be a numerical Instagram Scoped ID (IGSID)',
      );
    }

    if (!isLiveMode()) {
      const externalMessageId = `ig_out_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      return {
        success: true,
        externalMessageId,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: recipientId,
          isHumanAgentWindow: isHumanAgent,
          simulated: true,
        },
      };
    }

    // Fail closed in live mode: credentials must be present
    const accessToken = getEnvValue('INSTAGRAM_ACCESS_TOKEN');
    const apiVersion = getEnvValue('META_GRAPH_API_VERSION') || 'v26.0';

    if (!accessToken) {
      throw new BadGatewayError(
        'Instagram Graph API is not configured or missing credentials in live mode',
      );
    }

    const url = `https://graph.facebook.com/${apiVersion}/me/messages`;

    const requestPayload: Record<string, unknown> = {
      recipient: {
        id: recipientId,
      },
      message: {
        text: params.body,
      },
    };

    if (isHumanAgent) {
      requestPayload['messaging_type'] = 'MESSAGE_TAG';
      requestPayload['tag'] = 'HUMAN_AGENT';
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
      });

      const responseBody = (await response.json().catch(() => ({}))) as {
        message_id?: string;
        recipient_id?: string;
        error?: MetaInstagramGraphErrorResponse['error'];
      };

      if (!response.ok || !responseBody.message_id) {
        logger.error(
          `Meta Instagram API delivery failed: ${responseBody.error?.message || response.statusText} (status ${response.status})`,
        );
        throw parseInstagramGraphError(
          response.status,
          responseBody,
          response.statusText || 'Meta Graph API delivery failed',
        );
      }

      return {
        success: true,
        externalMessageId: responseBody.message_id,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: recipientId,
          isHumanAgentWindow: isHumanAgent,
          simulated: false,
        },
      };
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network error';
      logger.error(`Network error communicating with Instagram Graph API: ${message}`);
      throw new BadGatewayError(`Instagram API network failure: ${message}`);
    }
  }
}

export const instagramAdapter = new InstagramAdapter();

