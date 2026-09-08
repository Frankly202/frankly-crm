import crypto from 'crypto';
import { Request } from 'express';
import { ChannelType, LeadCategory } from '@prisma/client';
import {
  ChannelAdapter,
  NormalizedInboundMessage,
  OutboundMessageParams,
  OutboundDeliveryResult,
} from './channel-adapter.interface.js';
import { normalizeEmail, normalizePhone } from '../../../common/utils/identifier.util.js';

interface WebsiteFormPayload {
  name?: string;
  email?: string;
  phone?: string;
  category?: string;
  notes?: string;
  message?: string;
  submissionId?: string;
  _hp_company?: string; // Honeypot field - must be empty
}

export class WebsiteFormAdapter implements ChannelAdapter {
  readonly channel = ChannelType.WEBSITE_FORM;

  verifyWebhookSignature(req: Request): boolean {
    const payload = req.body as WebsiteFormPayload;
    // Honeypot spam check: if filled, verification fails
    if (payload && payload._hp_company && payload._hp_company.trim().length > 0) {
      return false;
    }
    return true;
  }

  normalizeInboundPayload(payload: unknown): NormalizedInboundMessage[] {
    const data = payload as WebsiteFormPayload;

    // Honeypot check: drop bot submissions
    if (data._hp_company && data._hp_company.trim().length > 0) {
      return [];
    }

    const email = data.email ? normalizeEmail(data.email) : '';
    const phone = data.phone ? normalizePhone(data.phone) : '';
    const senderIdentifier = email || phone || 'Anonymous Website Visitor';

    const body = data.message || data.notes || 'Website form enquiry submission';

    // Map requested category to LeadCategory enum if matched
    let suggestedCategory: LeadCategory | undefined;
    if (data.category && Object.values(LeadCategory).includes(data.category as LeadCategory)) {
      suggestedCategory = data.category as LeadCategory;
    }

    const externalMessageId =
      data.submissionId ||
      `web_sub_${crypto
        .createHash('sha256')
        .update(`${email}_${phone}_${body}_${Date.now()}`)
        .digest('hex')
        .slice(0, 24)}`;

    return [
      {
        channel: ChannelType.WEBSITE_FORM,
        externalMessageId,
        senderIdentifier,
        senderName: data.name?.trim() || undefined,
        recipientIdentifier: 'FranklyEdu Web Portal',
        body,
        rawPayload: data as unknown as Record<string, unknown>,
        timestamp: new Date(),
        suggestedCategory,
      },
    ];
  }

  async sendOutboundMessage(params: OutboundMessageParams): Promise<OutboundDeliveryResult> {
    return {
      success: true,
      externalMessageId: `web_out_${Date.now()}`,
      timestamp: new Date(),
      details: {
        channel: this.channel,
        recipient: params.recipientIdentifier,
        simulated: true,
      },
    };
  }
}

export const websiteFormAdapter = new WebsiteFormAdapter();
