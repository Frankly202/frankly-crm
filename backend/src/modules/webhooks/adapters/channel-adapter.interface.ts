import { ChannelType, LeadCategory } from '@prisma/client';
import { Request } from 'express';

export interface NormalizedInboundMessage {
  channel: ChannelType;
  externalMessageId: string;
  senderIdentifier: string; // Normalized E.164 phone, lowercase email, or @instagram_handle
  senderName?: string;
  recipientIdentifier: string;
  body: string;
  subject?: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  references?: string;
  rawPayload: Record<string, unknown>;
  timestamp: Date;
  suggestedCategory?: LeadCategory;
}

export interface OutboundMessageParams {
  conversationId: string;
  recipientIdentifier: string;
  body: string;
  subject?: string;
  inReplyTo?: string;
  references?: string;
  idempotencyKey?: string;
  senderIdentifier?: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundDeliveryResult {
  success: boolean;
  externalMessageId: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface ChannelAdapter {
  readonly channel: ChannelType;
  verifyWebhookSignature(req: Request): boolean;
  normalizeInboundPayload(
    payload: unknown,
  ): NormalizedInboundMessage[] | Promise<NormalizedInboundMessage[]>;
  sendOutboundMessage(params: OutboundMessageParams): Promise<OutboundDeliveryResult>;
}
