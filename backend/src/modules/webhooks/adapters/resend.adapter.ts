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
import { BadGatewayError } from '../../../common/errors/app-error.js';
import { logger } from '../../../common/utils/logger.js';

import { z } from 'zod';

const resendReceivingEmailSchema = z.object({
  id: z.string().optional(),
  text: z.string().nullable().optional(),
  html: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  headers: z.record(z.unknown()).optional(),
});

function getHeaderValue(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === target) {
      if (Array.isArray(val)) {
        return val.map((v) => String(v).trim()).filter(Boolean).join(' ') || undefined;
      }
      if (typeof val === 'string') {
        return val.trim() || undefined;
      }
    }
  }
  return undefined;
}

function sanitizeHeader(val: string | undefined): string | undefined {
  if (!val) return undefined;
  return val.replace(/[\r\n]+/g, ' ').trim();
}

export const MAX_EMAIL_BODY_LENGTH = 250_000;
export const BODY_TRUNCATION_NOTICE = '\n\n[Message body truncated: content exceeded 250KB display limit]';

export function applySafeBodyLimit(body: string): string {
  if (body.length > MAX_EMAIL_BODY_LENGTH) {
    return body.slice(0, MAX_EMAIL_BODY_LENGTH) + BODY_TRUNCATION_NOTICE;
  }
  return body;
}

export function minimizeRawPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const sanitized = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  if ('rawHtml' in sanitized) {
    delete sanitized['rawHtml'];
  }
  if (sanitized['data'] && typeof sanitized['data'] === 'object' && sanitized['data'] !== null) {
    const dataObj = sanitized['data'] as Record<string, unknown>;
    delete dataObj['html'];
    delete dataObj['rawHtml'];
  }
  return sanitized;
}

export const RETRIEVAL_ATTEMPT_1_TIMEOUT_MS = 3500;
export const RETRIEVAL_ATTEMPT_2_TIMEOUT_MS = 3000;
export const RETRIEVAL_BACKOFF_MS = 500;

export interface ReceivedEmailContentResult {
  text?: string | null;
  html?: string | null;
  subject?: string | null;
  headers?: Record<string, unknown>;
  fetchStatus: 'SUCCESS' | 'FAILED';
  statusCode?: number;
  error?: string;
}

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
    // In local non-production development/testing, explicitly allow designated fixture test requests
    if (
      env.NODE_ENV !== 'production' &&
      env.PROVIDER_MODE !== 'live' &&
      req.headers['x-local-fixture-test'] === 'true'
    ) {
      return true;
    }

    const secret = env.RESEND_WEBHOOK_SECRET || process.env['RESEND_WEBHOOK_SECRET'];

    if (secret) {
      const svixId = req.headers['svix-id'] as string | undefined;
      const svixTimestamp = req.headers['svix-timestamp'] as string | undefined;
      const svixSignature = req.headers['svix-signature'] as string | undefined;

      if (!svixId || !svixTimestamp || !svixSignature) {
        return false;
      }

      // Replay protection: enforce Svix 5-minute tolerance
      const timestampSec = parseInt(svixTimestamp, 10);
      if (isNaN(timestampSec)) {
        return false;
      }
      const nowSec = Math.floor(Date.now() / 1000);
      const toleranceSec = 5 * 60; // 5 minutes
      if (Math.abs(nowSec - timestampSec) > toleranceSec) {
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
          const sigBuf = Buffer.from(sig);
          const expBuf = Buffer.from(expectedSignature);
          if (sigBuf.length !== expBuf.length) {
            return false;
          }
          return crypto.timingSafeEqual(sigBuf, expBuf);
        } catch {
          return false;
        }
      });

      return matched;
    }

    // Fail closed in production or when live mode is active if secret is not configured
    if (env.NODE_ENV === 'production' || env.PROVIDER_MODE === 'live') {
      return false;
    }

    // In local non-production, explicitly allow only designated fixture test requests
    return req.headers['x-local-fixture-test'] === 'true';
  }

  /**
   * Fetch full email content from Resend Receiving API (GET /emails/receiving/:email_id).
   * Safe, bounded retry (attempt 1: 3.5s, 500ms backoff, attempt 2: 3.0s, ~7s total budget).
   * Retry only on HTTP 429, HTTP 5xx, or network/abort timeout.
   * Fails fast on non-retryable 4xx responses (401, 403, 404, 422).
   * Sanitized logging (no keys or headers logged).
   */
  async fetchReceivedEmailContent(emailId: string): Promise<ReceivedEmailContentResult> {
    const apiKey = env.RESEND_API_KEY?.trim() || process.env['RESEND_API_KEY']?.trim();
    if (!apiKey) {
      return {
        fetchStatus: 'FAILED',
        error: 'RESEND_API_KEY is not configured',
      };
    }

    const url = `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`;
    const attempts = [
      { attempt: 1, timeoutMs: RETRIEVAL_ATTEMPT_1_TIMEOUT_MS },
      { attempt: 2, timeoutMs: RETRIEVAL_ATTEMPT_2_TIMEOUT_MS },
    ];

    let lastResult: ReceivedEmailContentResult = {
      fetchStatus: 'FAILED',
      error: 'Unknown retrieval error',
    };

    for (let i = 0; i < attempts.length; i++) {
      const { attempt, timeoutMs } = attempts[i]!;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
          const rawJson = await response.json();
          const parseResult = resendReceivingEmailSchema.safeParse(rawJson);
          if (!parseResult.success) {
            logger.warn('Resend Receiving API response validation failed', {
              emailId,
              attempt,
              issues: parseResult.error.issues.map((issue) => issue.message),
            });
            return {
              fetchStatus: 'FAILED',
              statusCode: response.status,
              error: 'Invalid schema',
            };
          }

          if (attempt > 1) {
            logger.info('Successfully fetched email content from Resend Receiving API on retry', {
              emailId,
              attempt,
            });
          }

          return {
            text: parseResult.data.text ?? null,
            html: parseResult.data.html ?? null,
            subject: parseResult.data.subject ?? null,
            headers: parseResult.data.headers,
            fetchStatus: 'SUCCESS',
            statusCode: response.status,
          };
        }

        const status = response.status;
        const isRetryable = status === 429 || (status >= 500 && status <= 599);

        lastResult = {
          fetchStatus: 'FAILED',
          statusCode: status,
          error: `HTTP ${status}`,
        };

        if (!isRetryable || attempt === attempts.length) {
          logger.warn(
            `Resend Receiving API returned non-200 status for email: ${status}${isRetryable ? ' (retries exhausted)' : ' (non-retryable)'}`,
            {
              emailId,
              attempt,
              status,
            },
          );
          return lastResult;
        }

        logger.warn(
          `Resend Receiving API returned retryable status ${status} on attempt ${attempt}, retrying in ${RETRIEVAL_BACKOFF_MS}ms...`,
          {
            emailId,
            attempt,
            status,
          },
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        lastResult = {
          fetchStatus: 'FAILED',
          error: errorMsg,
        };

        if (attempt === attempts.length) {
          logger.warn(`Failed to fetch email content from Resend Receiving API on attempt ${attempt} (retries exhausted)`, {
            emailId,
            attempt,
            error: errorMsg,
          });
          return lastResult;
        }

        logger.warn(
          `Failed to fetch email content from Resend Receiving API on attempt ${attempt} (${errorMsg}), retrying in ${RETRIEVAL_BACKOFF_MS}ms...`,
          {
            emailId,
            attempt,
            error: errorMsg,
          },
        );
      }

      // Backoff before retry
      await new Promise((resolve) => setTimeout(resolve, RETRIEVAL_BACKOFF_MS));
    }

    return lastResult;
  }

  async normalizeInboundPayload(payload: unknown): Promise<NormalizedInboundMessage[]> {
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

    let body = data.data.text?.trim() || '';
    let html = data.data.html?.trim() || '';
    let subject = data.data.subject?.trim() || undefined;
    let rfcMessageId: string | undefined;
    let inReplyTo: string | undefined;
    let references: string | undefined;
    let contentFetchResult: ReceivedEmailContentResult | undefined;

    if (data.data.email_id) {
      contentFetchResult = await this.fetchReceivedEmailContent(data.data.email_id);
      if (contentFetchResult.fetchStatus === 'SUCCESS') {
        if (!body && contentFetchResult.text?.trim()) {
          body = contentFetchResult.text.trim();
        }
        if (!html && contentFetchResult.html?.trim()) {
          html = contentFetchResult.html.trim();
        }
        if (contentFetchResult.subject?.trim()) {
          subject = contentFetchResult.subject.trim();
        }
        if (contentFetchResult.headers) {
          rfcMessageId = getHeaderValue(contentFetchResult.headers, 'message-id');
          inReplyTo = getHeaderValue(contentFetchResult.headers, 'in-reply-to');
          references = getHeaderValue(contentFetchResult.headers, 'references');
        }
      }
    }

    if (!body && html) {
      // Strip HTML tags for clean text view
      body = html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (!body) {
      if (contentFetchResult?.fetchStatus === 'FAILED') {
        body = subject
          ? `[Subject: ${subject}] (Email content retrieval pending)`
          : '[Email content retrieval pending]';
      } else if (subject) {
        body = `[Subject: ${subject}]`;
      }
    }

    const rawPayload = minimizeRawPayload(data);
    if (contentFetchResult?.fetchStatus === 'FAILED') {
      rawPayload['contentFetchStatus'] = 'FAILED';
      if (contentFetchResult.statusCode !== undefined) {
        rawPayload['statusCode'] = contentFetchResult.statusCode;
      }
    }

    const timestamp = data.created_at ? new Date(data.created_at) : new Date();

    return [
      {
        channel: ChannelType.RESEND_EMAIL,
        externalMessageId: data.data.email_id,
        senderIdentifier,
        senderName,
        recipientIdentifier,
        body: applySafeBodyLimit(body),
        subject: sanitizeHeader(subject),
        rfcMessageId: sanitizeHeader(rfcMessageId),
        inReplyTo: sanitizeHeader(inReplyTo),
        references: sanitizeHeader(references),
        rawPayload,
        timestamp,
      },
    ];
  }

  async sendOutboundMessage(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
    const sanitizedSubject = sanitizeHeader(
      params.subject || (params.metadata?.['subject'] as string) || 'FranklyEdu Global CRM',
    );
    const sanitizedInReplyTo = sanitizeHeader(params.inReplyTo);
    const sanitizedReferences = sanitizeHeader(params.references);

    if (env.PROVIDER_MODE === 'mock') {
      const externalMessageId = `resend_out_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      return {
        success: true,
        externalMessageId,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: params.recipientIdentifier,
          simulated: true,
          subject: sanitizedSubject,
          idempotencyKey: params.idempotencyKey,
          inReplyTo: sanitizedInReplyTo,
          references: sanitizedReferences,
        },
      };
    }

    // Fail closed in live mode: credentials and from address must be configured
    const apiKey = env.RESEND_API_KEY?.trim();
    const fromAddress = env.EMAIL_FROM_ADDRESS?.trim();
    const replyTo = env.EMAIL_REPLY_TO?.trim();

    if (!apiKey || !fromAddress) {
      throw new BadGatewayError(
        'Resend provider is not configured or missing required credentials in live mode',
      );
    }

    const recipientEmail = params.recipientIdentifier.trim();
    if (!recipientEmail) {
      throw new BadGatewayError('Invalid recipient email address');
    }

    const url = 'https://api.resend.com/emails';

    try {
      const reqHeaders: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      };
      if (params.idempotencyKey) {
        reqHeaders['Idempotency-Key'] = params.idempotencyKey;
      }

      const customEmailHeaders: Record<string, string> = {};
      if (sanitizedInReplyTo) {
        customEmailHeaders['In-Reply-To'] = sanitizedInReplyTo;
      }
      if (sanitizedReferences) {
        customEmailHeaders['References'] = sanitizedReferences;
      }

      const requestPayload: Record<string, unknown> = {
        from: fromAddress,
        to: [recipientEmail],
        reply_to: replyTo || undefined,
        subject: sanitizedSubject,
        text: params.body,
      };

      if (Object.keys(customEmailHeaders).length > 0) {
        requestPayload['headers'] = customEmailHeaders;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(requestPayload),
      });

      const responseBody = (await response.json().catch(() => ({}))) as {
        id?: string;
        message?: string;
        name?: string;
      };

      if (!response.ok || !responseBody.id) {
        const errorMsg = responseBody.message || response.statusText || 'Resend API error';
        logger.error(`Resend email delivery failed: ${errorMsg} (status ${response.status})`);
        throw new BadGatewayError(`Resend delivery failed: ${errorMsg}`, {
          status: response.status,
        });
      }

      return {
        success: true,
        externalMessageId: responseBody.id,
        timestamp: new Date(),
        details: {
          channel: this.channel,
          recipient: recipientEmail,
          simulated: false,
        },
      };
    } catch (err) {
      if (err instanceof BadGatewayError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Network error';
      logger.error(`Network error communicating with Resend API: ${message}`);
      throw new BadGatewayError(`Resend API network failure: ${message}`);
    }
  }
}

export const resendEmailAdapter = new ResendEmailAdapter();
